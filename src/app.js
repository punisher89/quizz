(function(){
'use strict';
const {CATEGORIES,QUESTIONS}=window.QuizContent;
const {CLOSE,GRAB}=window.ShowData;
const FAMILY=window.FamilyData.QUESTIONS;
const L=window.ShowLogic;
const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;};
let stored={};try{stored=JSON.parse(localStorage.getItem('quiz-live-settings')||'{}')}catch(_){}
const settings={count:[1,2,3,4].includes(stored.count)?stored.count:2,length:[3,5].includes(stored.length)?stored.length:5,time:[0,15,25,40].includes(stored.time)?stored.time:25,names:Array.from({length:4},(_,i)=>String(stored.names?.[i]||`Игрок ${i+1}`).slice(0,18)),format:stored.format==='versus'?'versus':'classic',rules:stored.rules==='family'?'family':'standard',avatars:Array.from({length:4},(_,i)=>Number.isInteger(stored.avatars?.[i])?((stored.avatars[i]%4)+4)%4:i)};
let game=null,mode='',item=null,choice=0,turn=0,answers=[],grabUsed=[],grabAlive=[],grabCorrect=0,reveal='',roundAward=[],questionCategory=0,categoryChoice=0,deadline=0,remaining=0,paused=false,muted=false,audio=null,menuFocus=5;
let lastShownSec=-1;
const decks=QUESTIONS.map(q=>shuffle(q));const familyDecks=FAMILY.map(q=>shuffle(q));const ranks=shuffle(CLOSE), bags=shuffle(GRAB);let rankAt=0,bagAt=0;
const roundColors=['#25dcc3','#d890ff','#ffa255','#ff638d','#9b9dff'];
const colorFor=id=>['#ff77b4','#52d5ff','#ffd166','#b7fa79'][id];
const wedgeSVG=(arr,size=30)=>`<svg width="${size}" height="${size}" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="26" fill="#172037"/>${CATEGORIES.map((c,i)=>{const a=(-90+i*60)*Math.PI/180,b=(-90+(i+1)*60)*Math.PI/180;const p1=[30+24*Math.cos(a),30+24*Math.sin(a)],p2=[30+24*Math.cos(b),30+24*Math.sin(b)];return `<path d="M30 30 L${p1[0]} ${p1[1]} A24 24 0 0 1 ${p2[0]} ${p2[1]}Z" fill="${arr[i]?c.color:'#293247'}" stroke="#0b1430" stroke-width="1.6"/>`}).join('')}<circle cx="30" cy="30" r="5" fill="#10182d"/></svg>`;
function save(){try{localStorage.setItem('quiz-live-settings',JSON.stringify(settings))}catch(_){}}
function sound(type='click'){if(muted)return;try{audio||=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const notes=type==='win'?[523,660,784,1047]:type==='good'?[440,660]:type==='bad'?[240,180]:[440];notes.forEach((v,i)=>{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.1;o.type='sine';o.frequency.value=v;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.08,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.17);o.connect(g).connect(audio.destination);o.start(t);o.stop(t+.2)})}catch(_){}}
function menuRender(){game=null;$('menu').hidden=false;$('play').hidden=true;$('pause').hidden=true;
 $('format-select').querySelectorAll('button').forEach(b=>b.classList.toggle('chosen',b.dataset.format===settings.format));
 $('question-select').querySelectorAll('button').forEach(b=>b.classList.toggle('chosen',b.dataset.rules===settings.rules));
 $('count-select').querySelectorAll('button').forEach(b=>b.classList.toggle('chosen',+b.dataset.count===settings.count));
 $('length-select').querySelectorAll('button').forEach(b=>b.classList.toggle('chosen',+b.dataset.length===settings.length));
 $('time-select').querySelectorAll('button').forEach(b=>b.classList.toggle('chosen',+b.dataset.time===settings.time));
 $('names').innerHTML=settings.names.slice(0,settings.count).map((n,i)=>`<label class="name-row"><button type="button" class="portrait-pick" data-avatar="${i}" aria-label="Сменить персонажа игрока ${i+1}" title="Сменить персонажа"><img src="assets/avatar-${settings.avatars[i]+1}.webp" alt=""></button><input maxlength="18" data-name="${i}" value="${escape(n)}" aria-label="Имя участника ${i+1}"></label>`).join('');
}
function createGame(){save();game=L.create(settings.names.slice(0,settings.count).map((n,i)=>n.trim()||`Игрок ${i+1}`),settings.length,{versus:settings.format==='versus',randomizeMid:true});$('menu').hidden=true;$('play').hidden=false;paused=false;$('pause').hidden=true;beginRound();}
function beginRound(){mode=game.plan[game.round];game.question=0;roundAward=[];answers=[];game.phase='intro';render();}
function nextQuestion(){if(mode==='rapid'){if(game.question>=L.LENGTH.rapid){endGame();return;}questionCategory=game.question%6;item=getStandard(questionCategory,true);startQuestion();return;}
 if(game.question>=L.LENGTH[mode]){endRound();return;}
 if(mode==='switch'){game.phase='category';categoryChoice=game.question%6;choice=categoryChoice;turn=game.question%game.players.length;render();return;}
 if(mode==='quick'){questionCategory=(game.question===4?Math.floor(Math.random()*6):game.round%6);item=getStandard(questionCategory,false);}
 if(mode==='close'){item={...ranks[(rankAt++)%ranks.length],kind:'close'};questionCategory=item.category;}
 if(mode==='grab'){item={...bags[(bagAt++)%bags.length],kind:'grab'};questionCategory=item.category;}
 startQuestion();}
function getStandard(cat,rapid){const source=settings.rules==='family'?FAMILY:QUESTIONS;const pile=settings.rules==='family'?familyDecks:decks;if(!pile[cat].length)pile[cat]=shuffle(source[cat]);const q=pile[cat].pop();if(!rapid)return {...q,kind:'normal'};const distractors=shuffle(q.answers.map((x,i)=>({text:x,correct:i===q.correct})).filter(a=>!a.correct));return {...q,kind:'rapid',options:shuffle([{text:q.answers[q.correct],correct:true},distractors[0]])};}
function startQuestion(){game.phase=mode==='grab'?'grab':'question';answers=game.players.map(()=>null);turn=0;choice=0;reveal='';grabUsed=[];grabAlive=game.players.map(()=>true);grabCorrect=0;
 if(item.kind==='close'){item.options=shuffle(item.answers.map((text,rank)=>({text,rank})));}
 if(item.kind==='normal'){item.options=shuffle(item.answers.map((text,i)=>({text,correct:i===item.correct})));}
 if(item.kind==='grab'){item.options=shuffle([...item.yes.map(text=>({text,correct:true})),...item.no.map(text=>({text,correct:false}))]);}
 startTimer();render();}
function startTimer(){remaining=settings.time||0;deadline=settings.time?performance.now()+settings.time*1000:0;lastShownSec=-1;}
function onTimer(){if(!game||paused||!deadline||!['question','grab'].includes(game.phase))return;const ms=Math.max(0,deadline-performance.now());remaining=ms/1000;const seconds=Math.ceil(remaining);if(seconds!==lastShownSec){lastShownSec=seconds;const e=$('timer-num');if(e)e.textContent=`${seconds}с`;const bar=$('timebar-fill');if(bar)bar.style.width=`${Math.max(0,Math.min(100,ms/(settings.time*1000)*100))}%`;}if(ms<=0){deadline=0;if(game.phase==='grab')grabPick(-1);else answerPick(-1);}}
function tickPoints(p,points,cat){p.score+=points;p.roundScore+=points;p.roundCorrect++;p.catScore||={};p.catScore[cat]=(p.catScore[cat]||0)+points;}
function answerPick(index){if(game?.phase!=='question'||paused)return;const p=game.players[turn];const option=item.options[index];answers[turn]={index,option:option||null};if(option){if(item.kind==='close'){tickPoints(p,[1200,900,600,300][option.rank],questionCategory);sound('good');}else if(option.correct){tickPoints(p,item.kind==='rapid'?1000:1000,questionCategory);if(item.kind==='rapid'&&!p.wedges[questionCategory]){if(game.versus)game.players.filter(x=>x.team===p.team).forEach(x=>x.wedges[questionCategory]=true);else p.wedges[questionCategory]=true;}sound('good');}else sound('bad');}
 if(turn<game.players.length-1){turn++;choice=0;startTimer();render();return;}
 deadline=0;game.phase='reveal';const list=game.players.map((pl,i)=>{const a=answers[i];const pts=a?.option?(item.kind==='close'?[1200,900,600,300][a.option.rank]:(a.option.correct?(item.kind==='rapid'?1000:1000):0)):0;return `${pl.name}: ${pts?`+${pts}`:'0'}`});reveal=list.join(' • ');
 if(mode==='rapid'){const w=L.chooseWinner(game);if(w>=0){game.winner=w;game.phase='finished';sound('win');}}
 render();}
function grabPick(index){if(game?.phase!=='grab'||paused)return;const tile=item.options[index],player=game.players[turn];if(tile&&grabUsed.includes(index))return;deadline=0;
 if(tile){grabUsed.push(index);if(tile.correct){grabCorrect++;tickPoints(player,400,questionCategory);sound('good');}else{grabAlive[turn]=false;sound('bad');}}else{grabAlive[turn]=false;sound('bad');}
 const alive=grabAlive.map((v,i)=>v?i:-1).filter(i=>i>=0);
 if(grabCorrect>=8||alive.length===0){game.phase='reveal';answers=game.players.map(p=>({points:p.roundScore}));reveal=`Правильных плиток найдено: ${grabCorrect} из 8.`;render();return;}
 let next=turn;for(let i=0;i<game.players.length;i++){next=(next+1)%game.players.length;if(grabAlive[next])break;}turn=next;choice=item.options.findIndex((_,i)=>!grabUsed.includes(i));if(choice<0)choice=0;startTimer();render();}
function endRound(){deadline=0;roundAward=[];const cats=game.players.map(p=>p.catScore||{});
 if(game.versus){for(let team=0;team<2;team++){const mates=game.players.filter(p=>p.team===team);if(mates.some(p=>p.roundScore>0)){const sum={};mates.forEach(p=>Object.entries(p.catScore||{}).forEach(([c,v])=>sum[c]=(sum[c]||0)+v));let cat=Object.entries(sum).sort((a,b)=>b[1]-a[1]).map(([c])=>+c).find(c=>!mates[0].wedges[c]);if(cat===undefined)cat=mates[0].wedges.findIndex(x=>!x);if(cat>=0){mates.forEach(p=>p.wedges[cat]=true);roundAward.push({player:mates[0].id,cat});}}}}else{game.players.forEach((p,i)=>{if(p.roundScore>0){let cat=Object.entries(cats[i]).sort((a,b)=>b[1]-a[1]).map(([x])=>+x).find(c=>!p.wedges[c]);if(cat===undefined)cat=p.wedges.findIndex(x=>!x);if(cat>=0){p.wedges[cat]=true;roundAward.push({player:i,cat});}}});}game.players.forEach(p=>{p.roundScore=0;p.roundCorrect=0;p.catScore={};});
 game.phase='between';render();}
function advance(){if(!game||paused)return;
 if(game.phase==='intro'){nextQuestion();sound();return;}
 if(game.phase==='category'){questionCategory=categoryChoice;item=getStandard(questionCategory,false);startQuestion();sound();return;}
 if(game.phase==='reveal'){game.question++;nextQuestion();sound();return;}
 if(game.phase==='between'){game.round++;beginRound();sound();return;}
 if(game.phase==='finished'){createGame();return;}
 if(game.phase==='question')answerPick(choice);
 if(game.phase==='grab')grabPick(choice);
}
function endGame(){game.winner=L.leader(game);game.phase='finished';sound('win');render();}
function palette(){return CATEGORIES[questionCategory]?.color||roundColors[game?.round%5||0];}
function heading(title,sub='',category=''){ $('headline').textContent=title;$('subtitle').textContent=sub;$('category-banner').innerHTML=category||'✦ СЕГОДНЯ В ПРЯМОМ ЭФИРЕ';$('category-banner').style.setProperty('--cat',palette());}
function tileMarkup(op,i){return `<button class="answer-tile ${i===choice?'focused':''} ${game.phase==='grab'?'grab-tile':''} ${grabUsed.includes(i)?'used '+(op.correct?'right':'wrong'):''}" data-choice="${i}" ${grabUsed.includes(i)?'disabled':''}><span class="letter">${i+1}</span><span class="answer-text">${escape(op.text)}</span>${grabUsed.includes(i)?`<span class="answer-state">${op.correct?'✓':'×'}</span>`:''}</button>`;}
function timerHTML(){return settings.time?`<div class="timebox"><div class="time-track"><div id="timebar-fill" style="width:${Math.max(0,Math.min(100,remaining/settings.time*100))}%"></div></div><b id="timer-num">${Math.ceil(remaining)}с</b></div>`:'';}
function optionsHTML(){const opts=item.options;const isGrab=game.phase==='grab';return `<div class="question-top"><div class="whose"><i style="background:${colorFor(turn)}"></i> ОТВЕЧАЕТ: <b>${escape(game.players[turn].name)}</b></div><div class="response-type">${isGrab?`ВЫБЕРИТЕ ВСЕ ВЕРНЫЕ · ${grabCorrect}/8`:'ВЫБЕРИТЕ ОДИН ОТВЕТ'}</div></div><div class="option-grid ${isGrab?'grid16':''}">${opts.map(tileMarkup).join('')}</div>${timerHTML()}<div class="question-controls"><button class="mini-primary" data-action="confirm">${isGrab?'ВЫБРАТЬ ПЛИТКУ':'ПОДТВЕРДИТЬ ОТВЕТ'} <span>✕ / A</span></button><span>${isGrab?'Ошибка выбывает из текущего задания':'Ответы будут раскрыты после выбора всех игроков'}</span></div>`;}
function render(){if(!game)return;
 $('round-name').textContent=L.ROUND_NAMES[mode];$('round-progress').textContent=`РАУНД ${game.round+1} / ${game.plan.length} · ${mode==='rapid'?'ФИНАЛ':`${Math.min(game.question+1,L.LENGTH[mode])}/${L.LENGTH[mode]}`}`;
 $('round-hint').textContent=`${game.players.length} УЧАСТНИК${game.players.length===1?'':game.players.length<5?'А':''} · ${CATEGORIES.length} ТЕМ`;
 const area=$('question-area');
 if(game.phase==='intro'){
 heading(L.ROUND_NAMES[mode],mode==='quick'?'Каждый игрок отвечает на пять вопросов.':mode==='switch'?'Выбирайте любимую категорию и отвечайте.':mode==='close'?'Все ответы дают очки, но лучший принесёт больше.':mode==='grab'?'Найдите 8 правильных вариантов среди 16.': 'Соберите шесть цветных секторов, чтобы победить.');
 area.innerHTML=`<div class="intro-display"><span class="round-num">0${game.round+1}</span><div class="intro-symbol">${['⚡','◈','◎','▦','✦'][game.round]||'✦'}</div><div class="intro-lead">${mode==='rapid'?'ПОСЛЕДНИЙ РАУНД':`${L.LENGTH[mode]} ИСПЫТАНИЙ`}</div><button class="primary in-game" data-action="continue">НАЧАТЬ РАУНД <span>↗</span></button></div>`;
 }else if(game.phase==='category'){
 heading('Выберите категорию','Выбор темы принадлежит одному участнику.', '◈ РЕШАЕТ: '+escape(game.players[turn].name));
 area.innerHTML=`<div class="category-grid">${CATEGORIES.map((c,i)=>`<button class="category-choice ${i===choice?'focused':''}" data-category="${i}" style="--color:${c.color}"><span>${c.emoji}</span><b>${escape(c.name)}</b></button>`).join('')}</div><button class="mini-primary center-confirm" data-action="confirm">ПОДТВЕРДИТЬ ТЕМУ · ✕ / A</button>`;
 }else if(game.phase==='question'||game.phase==='grab'){
 heading(item.text,'',`<span class="caticon">${CATEGORIES[questionCategory].emoji}</span> ${escape(CATEGORIES[questionCategory].name).toUpperCase()}`);
 area.innerHTML=optionsHTML();
 }else if(game.phase==='reveal'){
 const good=mode==='grab'?`${grabCorrect} / 8`:answers.filter(x=>x?.option&&(item.kind==='close'||x.option.correct)).length+' / '+game.players.length;
 heading('Результаты задания',reveal,`✦ ${escape(L.ROUND_NAMES[mode])}`);
 area.innerHTML=`<div class="results"><div class="result-medal">${mode==='grab'?'▦':'✦'}</div><div class="results-number">${good}</div><div class="results-label">${mode==='grab'?'ПРАВИЛЬНЫХ ВАРИАНТОВ':'ПРАВИЛЬНЫХ / ОЦЕНЁННЫХ ОТВЕТОВ'}</div>${mode!=='grab'?`<div class="correct-answer">${item.kind==='close'?'Самый выгодный ответ: ': 'Правильный ответ: '}<b>${escape(item.kind==='close'?item.answers[0]:item.answers[item.correct])}</b></div>`:`<div class="correct-answer">${escape(reveal)}</div>`}<button class="primary in-game" data-action="continue">СЛЕДУЮЩЕЕ ЗАДАНИЕ <span>↗</span></button></div>`;
 }else if(game.phase==='between'){
 heading('Раунд завершён',`Дальше: ${L.ROUND_NAMES[game.plan[game.round+1]]||'Финал'}`);
 area.innerHTML=`<div class="results"><div class="result-medal">✧</div><div class="results-number">+${roundAward.length}</div><div class="results-label">СЕКТОРОВ ЗАРАБОТАНО</div><div class="awards">${roundAward.length?roundAward.map(a=>`<span style="--color:${colorFor(a.player)}">${escape(game.players[a.player].name)} · ${CATEGORIES[a.cat].emoji}</span>`).join(''):'Пока никто не получил сектор'}</div><button class="primary in-game" data-action="continue">СЛЕДУЮЩИЙ РАУНД <span>↗</span></button></div>`;
 }else if(game.phase==='finished'){
 const winner=game.players[game.winner];heading('Победитель шоу!',game.versus?`Команда ${winner.team+1} победила!`:`Великолепная игра, ${winner.name}!`,'✦ ФИНАЛ');
 area.innerHTML=`<div class="results win"><div class="trophy">🏆</div><div class="winner-name">${game.versus?`КОМАНДА ${winner.team+1}`:escape(winner.name)}</div><div class="results-label">${L.countWedges(winner)} / 6 СЕКТОРОВ · ${winner.score} ОЧКОВ</div><div class="final-ranking">${[...game.players].sort((a,b)=>b.score-a.score).map((p,i)=>`<span>${i+1}. ${escape(p.name)} — ${p.score}</span>`).join('')}</div><button class="primary in-game" data-action="continue">РЕВАНШ <span>↗</span></button><button class="quiet" data-action="menu">В МЕНЮ</button></div>`;
 }
 renderPodiums();}
function renderPodiums(){const isAnswer=game.phase==='question';$('player-podiums').innerHTML=game.players.map((p,i)=>{const active=['question','grab'].includes(game.phase)&&turn===i;const done=(isAnswer&&answers[i])||(game.phase==='grab'&&!grabAlive[i]);return `<div class="podium ${active?'on-turn':''}" style="--accent:${colorFor(i)}"><div class="avatar avatar-photo" aria-hidden="true"><img src="assets/avatar-${settings.avatars[i]+1}.webp" alt=""></div><div class="podium-card"><div class="podium-id">P${i+1}</div><div class="podium-info"><b>${escape(p.name)}</b><span>${game.versus?'КОМАНДА '+(p.team+1)+' · ':''}${done?'✓ ОТВЕТ ДАН':active?'● ТВОЙ ВЫБОР':'В ИГРЕ'} · ${p.score} ОЧКОВ</span></div><div class="wedges">${wedgeSVG(p.wedges,38)}</div></div></div>`}).join('');}
function currentCols(){return game?.phase==='grab'?4:game?.phase==='category'?3:2;}
function navigate(dir){if(!game)return;const max=game.phase==='category'?6:game.phase==='grab'?16:item?.options?.length||4;const cols=currentCols();const delta=dir==='left'?-1:dir==='right'?1:dir==='up'?-cols:cols;
 if(game.phase==='category'){choice=(choice+delta+max)%max;categoryChoice=choice;render();sound();return;}
 if(game.phase==='question'||game.phase==='grab'){let next=(choice+delta+max)%max;if(game.phase==='grab')for(let k=0;k<max&&grabUsed.includes(next);k++)next=(next+delta+max)%max;choice=next;render();sound();}}
function togglePause(){if(!game||game.phase==='finished')return;paused=!paused;$('pause').hidden=!paused;if(paused){if(deadline)remaining=Math.max(0,(deadline-performance.now())/1000);}else if(deadline){deadline=performance.now()+remaining*1000;}}
function confirm(){if(!game)return;if(paused){togglePause();return;}if(game.phase==='category'){categoryChoice=choice;advance();return;}advance();}
function menuNav(key){
 const ids=['format-select','count-select','length-select','question-select','time-select','start'];
 if(key==='up')menuFocus=Math.max(0,menuFocus-1);
 if(key==='down')menuFocus=Math.min(ids.length-1,menuFocus+1);
 if(key==='left'||key==='right'){
  const delta=key==='left'?-1:1;
  if(menuFocus===0){settings.format=settings.format==='classic'?'versus':'classic';if(settings.format==='versus')settings.count=4;}
  if(menuFocus===1){const opts=[1,2,3,4];settings.count=opts[(opts.indexOf(settings.count)+delta+opts.length)%opts.length];if(settings.count!==4)settings.format='classic';}
  if(menuFocus===2){settings.length=settings.length===3?5:3;}
  if(menuFocus===3){settings.rules=settings.rules==='standard'?'family':'standard';}
  if(menuFocus===4){const opts=[0,15,25,40];settings.time=opts[(opts.indexOf(settings.time)+delta+opts.length)%opts.length];}
  if(menuFocus<5){menuRender();save();sound();}
 }
 if(key==='confirm'){if(menuFocus===5)createGame();else menuNav('right');}
 ids.forEach((id,i)=>$(id).classList.toggle('menu-focus',i===menuFocus));
}
function control(action,pad){if(paused){if(['pause','confirm'].includes(action))togglePause();return;}if(action==='pause'){togglePause();return;}if(!game){menuNav(action);return;}
 const pads=Array.from(navigator.getGamepads?.()||[]).filter(Boolean);if(pad!==undefined&&(['question','grab','category'].includes(game.phase))&&pads.length>=game.players.length&&pad!==turn)return;
 if(action==='confirm'){confirm();return;}
 if(['left','right','up','down'].includes(action))navigate(action);
 if(/^pick[1-9]$/.test(action)){const idx=Number(action.slice(4))-1;if(game.phase==='question'&&idx<item.options.length){choice=idx;confirm();}else if(game.phase==='grab'&&idx<16){choice=idx;confirm();}}}
const keyMap={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',Enter:'confirm',' ':'confirm',Escape:'pause',Backspace:'pause'};
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;const key=keyMap[e.key]||( /^[1-9]$/.test(e.key)?`pick${e.key}`:null);if(key){e.preventDefault();control(key);}});
document.addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.dataset.avatar!==undefined){const i=+btn.dataset.avatar;settings.avatars[i]=(settings.avatars[i]+1)%4;menuRender();save();return;}if(btn.dataset.format){settings.format=btn.dataset.format;if(settings.format==='versus')settings.count=4;menuRender();save();return;}if(btn.dataset.rules){settings.rules=btn.dataset.rules;menuRender();save();return;}if(btn.dataset.count){settings.count=+btn.dataset.count;if(settings.count!==4)settings.format='classic';menuRender();save();return;}if(btn.dataset.length){settings.length=+btn.dataset.length;menuRender();save();return;}if(btn.dataset.time!==undefined){settings.time=+btn.dataset.time;menuRender();save();return;}if(btn.dataset.category!==undefined){choice=+btn.dataset.category;categoryChoice=choice;advance();return;}if(btn.dataset.choice!==undefined){choice=+btn.dataset.choice;confirm();return;}if(btn.dataset.action==='confirm'||btn.dataset.action==='continue'){confirm();return;}if(btn.dataset.action==='menu'){menuRender();return;}});
$('names').addEventListener('input',e=>{if(e.target.dataset.name!==undefined){settings.names[+e.target.dataset.name]=e.target.value;save();}});
$('start').addEventListener('click',createGame);
$('sound').addEventListener('click',()=>{muted=!muted;$('sound').textContent=muted?'♩':'♫';});
$('fullscreen').addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();});
$('home-link').addEventListener('click',e=>{e.preventDefault();if(!game||game.phase==='finished')menuRender();else togglePause();});
$('resume').addEventListener('click',togglePause);$('exit').addEventListener('click',menuRender);
let padCache=new Map(),repeatCache=new Map();function pollPads(){const pads=Array.from(navigator.getGamepads?.()||[]).filter(Boolean);$('pad-status').textContent=pads.length?`🎮 Подключено: ${pads.length}`:'🎮 Подключите геймпад';const now=performance.now();pads.forEach((p,i)=>{const pressed=[0,1,9,12,13,14,15].filter(index=>p.buttons?.[index]?.pressed);const prev=padCache.get(p.index)||[];for(const btn of pressed)if(!prev.includes(btn)){const act={0:'confirm',1:'pause',9:'pause',12:'up',13:'down',14:'left',15:'right'}[btn];if(act)control(act,i);}padCache.set(p.index,pressed);const axes=p.axes||[];const horiz=axes[0]||0,vert=axes[1]||0;const ax=Math.abs(horiz)>0.65?(horiz>0?'right':'left'):Math.abs(vert)>0.65?(vert>0?'down':'up'):'';const info=repeatCache.get(p.index)||{dir:'',at:0};if(ax&&(!info.dir||ax!==info.dir||now-info.at>230)){control(ax,i);repeatCache.set(p.index,{dir:ax,at:now});}else if(!ax)repeatCache.set(p.index,{dir:'',at:0});});for(const id of [...padCache.keys()])if(!pads.some(p=>p.index===id))padCache.delete(id);onTimer();requestAnimationFrame(pollPads);}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game&&!paused&&!['finished','intro','between','reveal'].includes(game.phase))togglePause();});
menuRender();requestAnimationFrame(pollPads);
})();
