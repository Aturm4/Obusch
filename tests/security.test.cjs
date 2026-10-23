const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');
const test = require('node:test');

test('server security boundaries and normal mentor/student workflows', {timeout:30000}, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'club-security-'));
  const listener = net.createServer().listen(0,'127.0.0.1');
  await once(listener,'listening');const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  const root=path.join(__dirname,'..'),invite=randomUUID();
  const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),NODE_ENV:'test',DATA_DIR:directory,SESSION_SECRET:randomUUID(),MENTOR_INVITE_TOKEN:invite,UPLOAD_USER_QUOTA_MB:'1',UPLOAD_TOTAL_QUOTA_MB:'3'},stdio:'pipe'});
  let output='';child.stderr.on('data',chunk=>{output+=chunk;});child.stdout.on('data',chunk=>{output+=chunk;});
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit');}fs.rmSync(directory,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+port;
  for(let i=0;i<500;i++){try{await fetch(base+'/api/auth/me');break;}catch(error){if(i===499)throw new Error(output+'; '+error+'; '+error.cause);await new Promise(r=>setTimeout(r,20));}}
  async function json(route,body,cookie,method='POST') {
    const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {r,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  async function register(name,role='student',mentorInvite) {return json('/api/auth/register',{name,email:name+'@example.test',password:randomUUID(),role,mentorInvite});}
  async function upload(cookie,route,name='work.fig',bytes='design') {
    const form=new FormData();form.set('file',new Blob([bytes]),name);
    const r=await fetch(base+route,{method:'POST',headers:{Cookie:cookie},body:form});return {r,data:await r.json()};
  }
  const denied=await register('untrusted','mentor');assert.equal(denied.r.status,403);
  const wrong=await register('wrong','mentor','wrong');assert.equal(wrong.r.status,403);
  const mentor=await register('mentor','mentor',invite);assert.equal(mentor.r.status,200);
  const student=await register('student'),other=await register('other');
  assert.equal(student.data.user.role,'student');
  assert.equal((await register('later-untrusted','mentor')).r.status,403);
  const cookie=student.cookie,mc=mentor.cookie;
  const hw=(await json('/api/homework/current',undefined,cookie,'GET')).data.homework;
  assert.ok(hw?.id);
  let submission;

  await t.test('attachments require an owner or mentor and force inert downloads',async()=>{
    const up=await upload(cookie,'/api/homework/'+hw.id+'/submit','work.html','<b>harmless markup</b>');
    assert.equal(up.r.status,200);submission=up.data.submission;
    assert.equal((await fetch(base+submission.file.url)).status,401);
    assert.equal((await fetch(base+submission.file.url,{headers:{Cookie:other.cookie}})).status,404);
    for(const viewer of [cookie,mc]){
      const response=await fetch(base+submission.file.url,{headers:{Cookie:viewer}});
      assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/^application\/octet-stream/);
      assert.match(response.headers.get('content-disposition'),/^attachment;/);
      assert.match(response.headers.get('content-security-policy'),/sandbox/);
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      assert.equal(await response.text(),'<b>harmless markup</b>');
    }
    const previous=submission.file.url;
    const replaced=await upload(cookie,'/api/homework/'+hw.id+'/submit','new.fig');submission=replaced.data.submission;
    assert.equal((await fetch(base+previous,{headers:{Cookie:cookie}})).status,404);
    assert.equal((await fetch(base+submission.file.url,{headers:{Cookie:mc}})).status,200);
    const chat=await upload(cookie,'/api/chat/upload','chat.pdf');assert.equal(chat.r.status,200);
    assert.equal((await fetch(base+chat.data.file.url,{headers:{Cookie:cookie}})).status,200);
    assert.equal((await fetch(base+chat.data.file.url,{headers:{Cookie:other.cookie}})).status,404);
  });
  await t.test('invalid homework and mentor submissions leave no orphan files',async()=>{
    const before=fs.readdirSync(path.join(directory,'uploads')).length;
    assert.equal((await upload(cookie,'/api/homework/missing/submit')).r.status,404);
    assert.equal((await upload(mc,'/api/homework/'+hw.id+'/submit')).r.status,403);
    assert.equal(fs.readdirSync(path.join(directory,'uploads')).length,before);
  });
  await t.test('review accepts numeric rubric values and rejects markup-shaped values',async()=>{
    const detail=await json('/api/admin/submission/'+submission.id,undefined,mc,'GET');
    const criterionId=detail.data.homework.criteria[0].id;
    const route='/api/admin/submission/'+submission.id+'/review';
    for(const v of ['80','<b>marker</b>',-1,101]){
      assert.equal((await json(route,{verdict:'rework',scores:[{criterionId,v}]},mc)).r.status,400);
    }
    const comment={n:1,top:'25%',left:'50%',sc:'#8FA98C',svBg:'rgba(143,169,140,0.1)',tag:'Сетка',sev:'Совет',text:'Уточните отступ'};
    assert.equal((await json(route,{verdict:'rework',scores:[{criterionId,v:80}],comments:[{...comment,top:'0; background:url(https://example.test)'}]},mc)).r.status,400);
    const good=await json(route,{verdict:'rework',scores:[{criterionId,v:80}],comments:[comment],verdictText:'Хорошая работа'},mc);
    assert.equal(good.r.status,200);assert.equal(good.data.review.scores[0].v,80);
    const again=await json(route,{verdict:'rework',scores:[{criterionId,v:90}]},mc);
    assert.equal(again.data.review.comments[0].text,comment.text);
  });
  await t.test('draft and locked lesson boundaries cover read, completion, checklist and materials',async()=>{
    const builder=(await json('/api/admin/builder',undefined,mc,'GET')).data;
    const module=builder.modules.find(m=>m.status==='active');const lesson=module.lessons[0];
    const original=(await json('/api/lesson/'+lesson.id,undefined,mc,'GET')).data;
    assert.equal((await json('/api/admin/lesson/'+lesson.id,{status:'Черновик'},mc,'PATCH')).r.status,200);
    assert.equal((await json('/api/lesson/'+lesson.id,undefined,cookie,'GET')).r.status,404);
    const current=await json('/api/lesson/current',undefined,cookie,'GET');
    assert.ok(current.r.status===404 || current.data.lesson.id!==lesson.id);
    assert.equal((await json('/api/lesson/'+lesson.id+'/complete',{},cookie)).r.status,404);
    assert.equal((await json('/api/lesson/'+lesson.id+'/checklist',{itemId:'unknown',done:true},cookie)).r.status,404);
    for(const material of original.materials)assert.equal((await fetch(base+'/api/material/'+material.id+'/download',{headers:{Cookie:cookie}})).status,404);
    assert.equal((await json('/api/lesson/'+lesson.id,undefined,mc,'GET')).r.status,200);
    await json('/api/admin/lesson/'+lesson.id,{status:'Опубликован'},mc,'PATCH');
    assert.equal((await json('/api/lesson/'+lesson.id,undefined,cookie,'GET')).r.status,200);
    await json('/api/admin/lesson/'+hw.lessonId,undefined,mc,'DELETE');
    assert.equal((await json('/api/homework/current',undefined,cookie,'GET')).r.status,200);
    assert.equal((await upload(cookie,'/api/homework/'+hw.id+'/submit')).r.status,200);
    for(const locked of builder.modules.filter(m=>m.status==='locked'))for(const item of locked.lessons){
      assert.equal((await json('/api/lesson/'+item.id,undefined,cookie,'GET')).r.status,404);
    }
  });
  await t.test('retained, concurrent and unlinked uploads respect account and disk quotas',async()=>{
    const results=await Promise.all([upload(cookie,'/api/chat/upload','large.pdf',Buffer.alloc(700000)),upload(cookie,'/api/chat/upload','large.fig',Buffer.alloc(700000))]);
    assert.ok(results.some(r=>r.r.status===200));assert.ok(results.some(r=>r.r.status===413));
    const files=fs.readdirSync(path.join(directory,'uploads'));
    const bytes=files.filter(n=>n.startsWith(student.data.user.id+'--')).reduce((n,name)=>n+fs.statSync(path.join(directory,'uploads',name)).size,0);
    assert.ok(bytes<=1024*1024);
    fs.writeFileSync(path.join(directory,'uploads','legacy-unlinked.bin'),Buffer.alloc(3*1024*1024));
    assert.equal((await upload(other.cookie,'/api/chat/upload')).r.status,413);
  });
});

test('existing stored annotations are escaped and styles and score values are constrained',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  const snippet=source.slice(source.indexOf('  function loadReview()'),source.indexOf('  function setVerdictBadge'));
  const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',style:{}});return elements.get(id);};
  const prefix=source.slice(source.indexOf('  function esc('),source.indexOf('  function fileBadge('));
  const data={hasSubmission:true,review:{verdict:'rework',total:8,scores:[{v:'<b>score</b>',t:'test'}],comments:[{n:'<b>marker</b>',top:'0\" data-marker=\"bad',left:'25%',sc:'red\" data-marker=\"bad',svBg:'#8FA98C',tag:'test',text:'normal',sev:'note'}]}};
  vm.runInNewContext(prefix+snippet+';loadReview();',{$:get,api:async()=>data,setVerdictBadge(){},gradeColor:()=> '#8FA98C',console});
  await new Promise(resolve=>setImmediate(resolve));
  const html=[...elements.values()].map(e=>e.innerHTML).join('');
  assert.ok(!html.includes('<b>marker</b>'));assert.ok(html.includes('&lt;b&gt;marker&lt;/b&gt;'));
  assert.ok(!html.includes('data-marker='));assert.ok(!html.includes('<b>score</b>'));
});

test('a chat message cannot grant its sender access to a known foreign upload URL',()=>{
  const messages=[],submissions=[{studentId:'victim',file:{url:'/uploads/legacy.fig'}}];
  const db={raw:{messages,submissions},uid:()=>randomUUID(),submissions:{byStudent:id=>submissions.filter(s=>s.studentId===id)},messages:{thread:id=>messages.filter(m=>m.studentId===id),add:m=>messages.push(m)}};
  const compiled={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../server/uploads.js'),'utf8'),{module:compiled,__dirname:path.join(__dirname,'../server'),process:{env:{}},console,Buffer,require(id){if(id==='./db')return db;if(id==='fs')return {mkdirSync(){}};return require(id);}});
  const user={id:'attacker',name:'Student',role:'student'},handlers=new Map(),errors=[];
  const socket={on:(name,handler)=>handlers.set(name,handler),join(){},emit:(name,data)=>errors.push({name,data})};
  const io={on:(_name,handler)=>handler(socket),to:()=>({emit(){}})};
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const code=server.slice(server.indexOf("io.on('connection'"),server.indexOf('app.use((error'));
  vm.runInNewContext(code,{io,db,socketUser:()=>user,canAccessUpload:compiled.exports.canAccessUpload,initials:()=> 'S'});
  for(const url of ['/uploads/victim--known.pdf','/uploads/legacy.fig','/uploads/../data/db.json'])handlers.get('chat:send')({file:{name:'work',url}});
  assert.equal(messages.length,0);assert.equal(errors.filter(e=>e.name==='chat:error').length,3);
  handlers.get('chat:send')({file:{name:'own.fig',url:'/uploads/attacker--own.fig'}});
  assert.equal(messages.length,1);
});
