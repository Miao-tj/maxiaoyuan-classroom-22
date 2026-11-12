const definitions=[
 {name:'理论理解',max:30,items:[['出现课程概念',/实践|认识|矛盾|资本|生产力|生产关系|阶级|社会存在|价值规律|辩证/],['解释概念关系',/意味着|是指|决定|基础|反作用|相互|前提|一方面|另一方面|取决于/],['说明结论条件',/条件|只有|如果|当.{1,12}时|范围|局限/]],tip:'用自己的话解释一个核心概念，再说明它在什么条件下成立。'},
 {name:'文本依据',max:25,items:[['指明阅读材料',/《[^》]{2,36}》|第[一二三四五六七八九十\d]+[章节]/],['标出引用或定位',/“[^”]{5,100}”|第\s*\d+\s*页|原文中|文中写道/],['对原文作解释',/这句话|这段话|这里的|我的理解|作者指出|由此可见/]],tip:'选出一处原文，交代出处，并解释它怎样支持你的判断。'},
 {name:'联系实际',max:25,items:[['交代情境',/例如|比如|以.{2,18}为例|实验|观察|教室|实习|校园|社区|车间|工程/],['描述行动或观察',/记录|测量|访谈|收集|对照|比较|尝试|调研|发现/],['将观察连到结论',/说明|验证|检验|因此|结果|修正|表明|归纳/]],tip:'把案例写具体，说明谁做了什么、观察到什么，以及结论是否改变。'},
 {name:'结构与表达',max:20,items:[['形成多个论述句',null],['使用推理或转折',/因为|因此|然而|但是|所以|相反|首先|再者|进一步|尽管/],['收束观点或提出改进',/总之|综上|我认为|还应|下一步|下一次|由此|今后|还需要|可以进一步/]],tip:'让每段围绕一个判断展开，结尾回应开头的问题。'}];
export function rubricReview(text){
 const sentences=text.split(/(?<=[。！？!?])|\n+/u).map(s=>s.trim()).filter(Boolean);
 const dimensions=definitions.map(d=>{const signals=d.items.map(([name,re])=>({name,match:re?sentences.find(s=>re.test(s)):sentences.length>=3?sentences[0]:null}));const seen=signals.filter(i=>i.match);const n=seen.length;const example=seen[0]?.match;const score=Math.round(d.max*[0,.35,.67,1][n]);return {name:d.name,max:d.max,score,comment:(example?'文中「'+example.slice(0,52)+(example.length>52?'…':'')+'」提供了可定位的表达。':'当前正文未出现本项量规可以定位的文字。')+' 命中 '+n+'/3 项：'+(seen.map(i=>i.name).join('、')||'暂无')+'。'+(n<3?d.tip:'请教师核对这些表达是否准确且有充分论证。')};});
 return {dimensions,total:dimensions.reduce((sum,d)=>sum+d.score,0),summary:'本次按十二项可观察的文字特征计算。引文真伪、概念使用是否正确以及论证质量仍需教师核读。',method:'课程量规'};
}
