export default {
  "id": "maxiaoyuan-demo-course",
  "title": "马克思主义基本原理 · 原创学习演示",
  "isDemo": true,
  "contentVersion": "demo-2026-10-27",
  "notice": "原创演示讲义与示例题，非教材原文、非正式题库；当前未连接模型，未导入用户教材。",
  "citationNotice": "片段定位仅指本应用原创演示讲义，不代表教材 RAG 引用。公开参考另列外链。",
  "chapters": [
    {
      "id": "demo-practice",
      "title": "实践与认识",
      "summary": "理解认识从何而来，以及怎样接受检验。",
      "paragraphs": [
        {
          "id": "demo-practice-p1",
          "title": "实践与认识相联系",
          "text": "实践是认识的基础。人们在改造客观世界的活动中提出问题、积累材料并发展认识。认识也能反过来指导实践：正确认识有助于行动，错误认识则可能使行动偏离实际。",
          "provenanceType": "original_demo",
          "citationLabel": "原创演示讲义 · 实践与认识 · 片段 1（非教材原文）"
        },
        {
          "id": "demo-practice-p2",
          "title": "让认识接受检验",
          "text": "学习书本能获得间接经验，不必所有知识都由个人亲历。但判断认识是否符合实际，不能只凭权威、投票或主观确信。检验需要联系实践；结论还须说明适用条件，不能由一次结果推断所有情况。",
          "provenanceType": "original_demo",
          "citationLabel": "原创演示讲义 · 实践与认识 · 片段 2（非教材原文）"
        }
      ],
      "concepts": [
        {"id": "practice-basis", "label": "实践基础", "definition": "认识产生和发展的基础在于实践。"},
        {"id": "practice-test", "label": "实践检验", "definition": "认识是否符合实际，需要接受实践检验。"}
      ],
      "guidingQuestion": "如果大家都赞成一个方案，这是否已经证明它符合实际？还需要什么证据？",
      "referenceIds": ["public-practice"],
      "questions": [
        {
          "id": "DEMO-Q1",
          "type": "single",
          "label": "原创示例题",
          "prompt": "某小组提出一种节水方案。要检验“该方案在既定条件下确实能减少用水”这一判断，最恰当的做法是：",
          "options": [
            {"id": "q1-a", "label": "A", "text": "只看提案者是否有很高声望。"},
            {"id": "q1-b", "label": "B", "text": "在明确条件下实施试验，记录并分析实际用水变化。"},
            {"id": "q1-c", "label": "C", "text": "只要多数成员赞成，就认定判断正确。"},
            {"id": "q1-d", "label": "D", "text": "只比较方案文字是否流畅，不考察实施结果。"}
          ],
          "answerKeys": ["q1-b"],
          "explanation": "本题考查实践检验认识。实际试验提供判断是否符合客观情况的依据；声望、投票和文字表达都不能替代它。结论须保留既定条件这一范围，不能凭一次试验推出所有环境下必然有效。",
          "snippetIds": ["demo-practice-p1", "demo-practice-p2"],
          "conceptIds": ["practice-test"]
        }
      ]
    },
    {
      "id": "demo-contradiction",
      "title": "对立统一",
      "summary": "区分辩证分析、机械折中与简单冲突。",
      "paragraphs": [
        {
          "id": "demo-contradiction-p1",
          "title": "同时考察对立与联系",
          "text": "分析矛盾，要看到双方相互对立，也要看到双方的联系。同一性并不意味着双方完全相同；斗争性表达双方的相互排斥，也不等同于日常争吵。二者是理解矛盾关系的重要方面。",
          "provenanceType": "original_demo",
          "citationLabel": "原创演示讲义 · 对立统一 · 片段 1（非教材原文）"
        },
        {
          "id": "demo-contradiction-p2",
          "title": "辩证分析不是机械折中",
          "text": "对立统一不是把两个意见取平均，也不是对任何问题都各打五十大板。应分析双方在什么条件下联系、怎样变化；矛盾双方的转化有具体条件。矛盾斗争的形式多样，不能一概等同于暴力对抗。",
          "provenanceType": "original_demo",
          "citationLabel": "原创演示讲义 · 对立统一 · 片段 2（非教材原文）"
        }
      ],
      "concepts": [
        {"id": "contradiction-unity", "label": "同一性", "definition": "矛盾双方具有相互依存、相互贯通的联系，而非完全相同。"},
        {"id": "contradiction-struggle", "label": "斗争性", "definition": "矛盾双方相互排斥的属性，不等于一律采取暴力形式。"}
      ],
      "guidingQuestion": "为什么辩证分析不能简单地等同于“双方各退一步，永远取中间值”？",
      "referenceIds": ["public-contradiction"],
      "questions": [
        {
          "id": "DEMO-Q2",
          "type": "single",
          "label": "原创示例题",
          "prompt": "下列对矛盾的同一性与斗争性的理解，正确的是：",
          "options": [
            {"id": "q2-a", "label": "A", "text": "同一性意味着矛盾双方完全相同，不存在差别。"},
            {"id": "q2-b", "label": "B", "text": "斗争性意味着所有矛盾都只能通过暴力解决。"},
            {"id": "q2-c", "label": "C", "text": "对立统一要求任何问题都取两个意见的算术平均。"},
            {"id": "q2-d", "label": "D", "text": "分析矛盾既要看到双方的对立，也要考察其联系及具体条件。"}
          ],
          "answerKeys": ["q2-d"],
          "explanation": "辩证分析不是取消差别或机械折中；矛盾斗争的形式也不只有对抗。D 同时保留了对立、联系与条件三个分析要求。",
          "snippetIds": ["demo-contradiction-p1", "demo-contradiction-p2"],
          "conceptIds": ["contradiction-unity", "contradiction-struggle"]
        }
      ]
    },
    {
      "id": "demo-specific-analysis",
      "title": "具体问题具体分析",
      "summary": "在共同现象中识别不同条件，避免照搬答案。",
      "paragraphs": [
        {
          "id": "demo-specific-p1",
          "title": "共同现象不等于相同条件",
          "text": "矛盾具有普遍性，也有特殊性。认识具体问题，不能只看到它与其他问题的共同点，还要调查对象、条件和发展阶段的差异。相同的现象名称，背后可能存在不同的成因与关系。",
          "provenanceType": "original_demo",
          "citationLabel": "原创演示讲义 · 具体问题具体分析 · 片段 1（非教材原文）"
        },
        {
          "id": "demo-specific-p2",
          "title": "调查后有针对性地行动",
          "text": "具体问题具体分析要求把一般原理同实际情况结合。面对两个社区的停车难，可以先比较空间、需求和管理条件，再选择办法。既不能不加调查地照搬，也不能因为存在差异就否认共性、拒绝借鉴。",
          "provenanceType": "original_demo",
          "citationLabel": "原创演示讲义 · 具体问题具体分析 · 片段 2（非教材原文）"
        }
      ],
      "concepts": [
        {"id": "contradiction-specificity", "label": "特殊性", "definition": "具体事物及其不同发展阶段的矛盾各有特点。"},
        {"id": "specific-analysis", "label": "具体分析", "definition": "调查对象与条件，把一般原理同具体情况结合。"}
      ],
      "guidingQuestion": "两个地方遇到名称相同的问题，为什么未必应该采用完全相同的解决办法？",
      "referenceIds": ["public-specific-analysis"],
      "questions": [
        {
          "id": "DEMO-Q3",
          "type": "single",
          "label": "原创示例题",
          "prompt": "两个社区都存在停车难，但一个主要受道路空间限制，另一个主要因停车信息不畅。下列做法最符合具体问题具体分析要求的是：",
          "options": [
            {"id": "q3-a", "label": "A", "text": "分别调查成因和条件，再制定有针对性的办法。"},
            {"id": "q3-b", "label": "B", "text": "只因现象名称相同，就直接复制完全相同的方案。"},
            {"id": "q3-c", "label": "C", "text": "不需要了解实际情况，只选择听起来最全面的口号。"},
            {"id": "q3-d", "label": "D", "text": "否认两地存在任何共性，因此不作比较或借鉴。"}
          ],
          "answerKeys": ["q3-a"],
          "explanation": "相似现象不意味着具体条件相同。调查差异后有针对性地处理问题，既不是机械照搬，也不是拒绝比较和借鉴。题干是为说明方法而设计的简化案例，不是完整的城市治理建议。",
          "snippetIds": ["demo-specific-p1", "demo-specific-p2"],
          "conceptIds": ["contradiction-specificity", "specific-analysis"]
        }
      ]
    }
  ],
  "references": [
    {"id": "public-practice", "title": "公开参考：《实践论》", "url": "https://news.12371.cn/2017/08/29/ARTI1504001411770206.shtml", "type": "external_public_reference"},
    {"id": "public-contradiction", "title": "公开参考：《矛盾论》", "url": "https://news.12371.cn/2017/08/29/ARTI1504001209326173.shtml", "type": "external_public_reference"},
    {"id": "public-specific-analysis", "title": "公开参考：把握好运用好矛盾法则", "url": "https://dangshi.people.com.cn/n1/2020/0708/c85037-31775063.html", "type": "external_public_reference"},
    {"id": "public-hep-catalog", "title": "出版社目录参考：《马克思主义基本原理（2023年版）》", "url": "https://xuanshu.hep.com.cn/front/h5Mobile/bookDetails?bookId=63cac917938b7cc2960ef83d", "type": "external_public_reference"}
  ],
  "grading": {"pointsPerQuestion": 1, "totalQuestions": 3, "maxPoints": 3, "answerLabelSequence": ["B", "D", "A"], "compareStableOptionIds": true, "allowDuplicateScore": false}
}
;
