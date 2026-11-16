import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { playBot, SENSIBLE, type BotStyle } from '../src/gyms/bot';
import { createRun, IDEAS, step, TUNING, netPerS, priceMult } from '../src/systems/run/run';
import { companyContext, companyTotals } from '../src/systems/company/company';
import { segmentView } from '../src/systems/company/market';
import { blockEffects, PRODUCTION } from '../src/systems/run/product';

describe('paired strategy balance', () => {
  it('compares repeat research, one report and blind development on identical markets', () => {
    const strategies: Record<string,BotStyle> = {
      research: SENSIBLE, once:{...SENSIBLE,researchOnce:true}, blind:{...SENSIBLE,research:false},
      small:{...SENSIBLE,focus:'small'}, medium:{...SENSIBLE,focus:'medium'}, large:{...SENSIBLE,focus:'large'},
    };
    const result = Object.entries(strategies).map(([name,style]) => {
      const runs=Array.from({length:12},(_,i)=> {
        const run=createRun(3200+i,{tech:IDEAS.tech[i%IDEAS.tech.length],form:IDEAS.form[i%IDEAS.form.length],aud:IDEAS.aud[i%IDEAS.aud.length]});
        for(let tick=0;tick<TUNING.last_sprint*TUNING.sprint_s*4 && !run.over;tick++){playBot(run,style);run.offer=null;step(run,.25);}
        const ctx=companyContext(run);
        if(name==='research' && i===0) {const folder=join(tmpdir(),'progress','b2b-research');mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'example-economy.json'),JSON.stringify({eff:run.eff,price:priceMult(run),cards:run.cardStacks,mod:run.mod,blocks:run.blocks.map(b=>[b.kind,b.level]),infrastructure:run.infrastructure,idea:run.idea},null,2));}
        return {profit:run.over==='profit',net:netPerS(run),money:run.money,clients:companyTotals(run).count,reports:run.research.history.length,blocks:run.blocks.length,upgrades:run.blocks.reduce((n,b)=>n+b.level-1,0),agents:run.agents.length,maxBlocks:run.blocks.filter(b=>b.live && b.level===PRODUCTION.max_level).length,usefulNonMaxBlocks:run.blocks.filter(b=>b.live && b.level<PRODUCTION.max_level && Object.values(blockEffects(b.kind,b.level)).some(value=>value>0 && value!==1)).length,income:Object.fromEntries(['small','medium','large'].map(id=>[id,segmentView(run.market,ctx,id as 'small'|'medium'|'large').income]))};
      });
      const mean=(key:'net'|'money'|'clients'|'reports'|'blocks'|'upgrades')=>Math.round(runs.reduce((n,r)=>n+r[key],0)/runs.length*100)/100;
      return {name,profit:runs.filter(r=>r.profit).length,net:mean('net'),money:mean('money'),clients:mean('clients'),reports:mean('reports'),blocks:mean('blocks'),upgrades:mean('upgrades'),runs};
    });
    const folder=join(tmpdir(),'progress','b2b-research');mkdirSync(folder,{recursive:true});writeFileSync(join(folder,'balance.json'),JSON.stringify(result,null,2));
    console.log('paired strategies', result.map(row => ({name:row.name,profit:row.profit,net:row.net,money:row.money,reports:row.reports,blocks:row.blocks,upgrades:row.upgrades})));
    expect(result.every(row=>row.runs.every(run=>Number.isFinite(run.net)&&Number.isFinite(run.money)))).toBe(true);
    expect(result[0].reports).toBeGreaterThan(result[1].reports);
    expect(result[1].reports).toBeLessThanOrEqual(2);
    expect(result[2].reports).toBe(0);
    expect(result[0].profit).toBeGreaterThan(0);
    expect(result[0].net).toBeGreaterThan(result[1].net);
    expect(result[0].net).toBeGreaterThan(result[2].net);
    expect(result.slice(3).every(row => row.profit >= 6)).toBe(true);
    const ordinaryRuns = result.flatMap(row => row.runs);
    expect(ordinaryRuns.some(run => run.profit && run.agents === 12)).toBe(true);
    expect(ordinaryRuns.some(run => run.profit && run.maxBlocks > 0 && run.usefulNonMaxBlocks > 0)).toBe(true);
  }, 60000);
});
