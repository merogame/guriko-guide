import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.split('<script>')[1].split('const setup=')[0];
const solve=vm.runInNewContext(source+';equilibrium',{Float64Array,performance,setTimeout});
const started=performance.now(),small=await solve(10),defaultMs=performance.now()-started;
const largeStarted=performance.now(),table=await solve(333),maximumMs=performance.now()-largeStarted;
const {size,values,policy}=table,Q=4294967296;
const probabilities=(a,b,rounded=false)=>{
  const i=(a*size+b)*2;
  let r=policy[i],c=policy[i+1];
  if(rounded){const first=Math.ceil(r*Q-.5)/Q,total=Math.ceil((r+c)*Q-.5)/Q;r=first;c=total-first}
  return[r,c,1-r-c];
};
const matrix=(a,b)=>[
  [values[a*size+b],values[Math.max(0,a-1)*size+b],values[a*size+Math.max(0,b-2)]],
  [values[a*size+b-1],values[a*size+b],values[Math.max(0,a-2)*size+b]],
  [values[Math.max(0,a-2)*size+b],values[a*size+Math.max(0,b-2)],values[a*size+b]]
];
let saddleGap=0,minimumProbability=1,maximumSymmetryError=0;
for(let a=1;a<size;a++)for(let b=1;b<size;b++){
  const p=probabilities(a,b),q=probabilities(b,a),m=matrix(a,b);
  if(p.some(x=>!Number.isFinite(x)||x<=0||x>=1))throw Error('Invalid full-support strategy');
  minimumProbability=Math.min(minimumProbability,...p);
  const low=Math.min(...[0,1,2].map(j=>p.reduce((sum,x,i)=>sum+x*m[i][j],0)));
  const high=Math.max(...m.map(row=>row.reduce((sum,x,j)=>sum+x*q[j],0)));
  saddleGap=Math.max(saddleGap,high-low);
  maximumSymmetryError=Math.max(maximumSymmetryError,Math.abs(values[a*size+b]+values[b*size+a]-1));
}

// Independent optimal-response calculation. With a fixed row strategy, choose
// the opponent's pure action and eliminate the tie self-loop analytically.
function bestResponse(rounded){
  const worst=new Float64Array(size*size);
  for(let b=0;b<size;b++)worst[b]=1;
  let maximumLoss=0;
  for(let a=1;a<size;a++)for(let b=1;b<size;b++){
    const p=probabilities(a,b,rounded),r=worst[Math.max(0,a-1)*size+b],s=worst[Math.max(0,a-2)*size+b],u=worst[a*size+b-1],t=worst[a*size+Math.max(0,b-2)];
    const v=Math.min((p[1]*u+p[2]*s)/(p[1]+p[2]),(p[0]*r+p[2]*t)/(p[0]+p[2]),(p[0]*t+p[1]*s)/(p[0]+p[1]));
    worst[a*size+b]=v;
    maximumLoss=Math.max(maximumLoss,values[a*size+b]-v);
  }
  return{maximumWinRateLoss:maximumLoss,initial30:worst[10*size+10],initial999:worst[333*size+333]};
}
const stored=bestResponse(false),sampled=bestResponse(true);
if(saddleGap>1e-10||maximumSymmetryError>1e-12||stored.maximumWinRateLoss>1e-9||sampled.maximumWinRateLoss>1e-7)throw Error('Equilibrium verification failed');
for(let a=1;a<=10;a++)for(let b=1;b<=10;b++){
  const i=(a*size+b)*2,j=(a*small.size+b)*2;
  if(Math.abs(values[a*size+b]-small.values[a*small.size+b])>1e-14||Math.abs(policy[i]-small.policy[j])>1e-14||Math.abs(policy[i+1]-small.policy[j+1])>1e-14)throw Error('Goal-dependent table mismatch');
}
const one=probabilities(1,1);
if(one.some(p=>Math.abs(p-1/3)>1e-14))throw Error('One-win game must be ordinary rock-paper-scissors');
const report={testedGoalRange:[1,999],activeStates:333*333,minimumProbability,saddleGap,maximumSymmetryError,stored,sampled,timingMs:{goal30:defaultMs,goal999:maximumMs},htmlBytes:Buffer.byteLength(html)};
writeFileSync(new URL('./accuracy.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
