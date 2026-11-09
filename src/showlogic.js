(function (root) {
'use strict';
const ROUND_NAMES={quick:'БЛИЦ-СТАРТ',switch:'ВЫБЕРИ ТЕМУ',close:'БЛИЖЕ К ЦЕЛИ',grab:'СОБЕРИ ОТВЕТЫ',rapid:'ФИНАЛЬНЫЙ СПРИНТ'};
const LENGTH={quick:5,switch:4,close:5,grab:4,rapid:24};
function plan(length){return length===3?['quick','grab','rapid']:['quick','switch','close','grab','rapid'];}
function create(names, length=5, options={}) {if(!Array.isArray(names)||names.length<1||names.length>4) throw Error('players 1–4'); if(![3,5].includes(length))throw Error('rounds 3 or 5');if(options.versus&&names.length!==4)throw Error('2v2 requires 4 players');let schedule=plan(length);if(options.randomizeMid&&length===5){const middle=['switch','close','grab'];for(let i=middle.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[middle[i],middle[j]]=[middle[j],middle[i]];}schedule=['quick',...middle,'rapid'];}return {versus:!!options.versus,players:names.map((name,id)=>({id,name,team:id%2,score:0,wedges:Array(6).fill(false),roundScore:0,roundCorrect:0})),plan:schedule,round:0,question:0,phase:'intro',winner:-1};}
function nextPlayer(current,players){return (current+1)%players;}
function awardRound(game,category){const out=[]; for(const p of game.players){if(p.roundScore>0){let idx=category;if(p.wedges[idx]) idx=p.wedges.findIndex(v=>!v);if(idx>=0){p.wedges[idx]=true;out.push(p.id);}}p.roundScore=0;p.roundCorrect=0;}return out;}
function scoreAnswer(player,correct,points){ if(correct){player.score+=points; player.roundScore+=points; player.roundCorrect++;}return correct?points:0;}
function scoreRank(player,rank){if(!Number.isInteger(rank)||rank<0||rank>3)throw Error('rank');return scoreAnswer(player,true,[1200,900,600,300][rank]);}
function countWedges(player){return player.wedges.filter(Boolean).length;}
function teamScore(game,team){return game.players.filter(p=>p.team===team).reduce((sum,p)=>sum+p.score,0);}
function leader(game){if(game.versus){return [game.players[0],game.players[1]].sort((a,b)=>countWedges(b)-countWedges(a)||teamScore(game,b.team)-teamScore(game,a.team))[0].id;}return [...game.players].sort((a,b)=>countWedges(b)-countWedges(a)||b.score-a.score)[0].id;}
function chooseWinner(game){if(game.versus){const winning=[0,1].filter(team=>game.players[team].wedges.every(Boolean));return winning.length?winning.sort((a,b)=>teamScore(game,b)-teamScore(game,a))[0]:-1;}const winners=game.players.filter(p=>countWedges(p)===6).sort((a,b)=>b.score-a.score);return winners.length?winners[0].id:-1;}
const api={ROUND_NAMES,LENGTH,plan,create,nextPlayer,awardRound,scoreAnswer,scoreRank,countWedges,teamScore,leader,chooseWinner};
root.ShowLogic=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window !== 'undefined'?window:globalThis);
