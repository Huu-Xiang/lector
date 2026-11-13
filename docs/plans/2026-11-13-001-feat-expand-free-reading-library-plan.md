---
title: Expand the Free Reading Library - Plan
date: 2026-11-13
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Expand the Free Reading Library - Plan

## Goal Capsule

- **Objective** 给中文和韩语学习者一个明确的试读起点，同时增加西语和韩语初学者能读完的免费内容。
- **Product authority** 用户确认同时扩展精选书单和新增书目。数量目标为本轮建议。
- **Open blockers** 新增书目和出处已核对。测试站部署后核验公开入口和试读。

## Product Contract

### Summary

推出韩语 B2 和中文 B1/B2 精选，同期补充中文、西语和韩语的低等级读物。让访客从找书直接进入免登录试读。

### Requirements

**精选书单**

- R1. 韩语 B2 精选现有四部作品。前三部为《山茶花》（동백꽃）、《好运的一天》（운수 좋은 날）和《七七团的秘密》（칠칠단의 비밀），补入《杜鹃花》（진달래꽃）。
- R2. 中文 B1 和 B2 各精选三本。B1 从《故事新读本（第一册）》开始，B2 从《儒林外史》开篇开始。
- R3. 每本精选说明适合的水平、推荐理由和试读时长，并提供免登录的试读直达链接。书单正文和链接对访客及搜索引擎可见。

**新增书目**

- R4. 西语 A1、A2 各以新增四本短读物为目标，优先选情节明确、能分成短篇的读本。
- R5. 韩语初级以新增六篇短读物为目标，优先选句子短、词汇常用、叙事容易跟上的童话或民间故事。
- R6. 新书须与现有书目去重，并在公开页注明来源、版本和授权。节选须标明范围，分级以实际文本为依据。
- R7. 新书出现在对应语言和等级的公开书库中，访客可免登录打开试读。书页使用可直接访问的链接，并可从现有书库导航和网站地图发现。
- R8. 中文 B1、B2 各以新增两本适读作品为目标，让两个等级的精选都有三本可选。
- R9. 韩语 B2 以再新增两部较易读的短篇为目标，核实后纳入精选。

### Key Decisions

- 中文当前最低是 B1。精选按书目实际等级标注，让读者判断适不适合自己。
- 数量是选书目标。若合适且授权清楚的版本不足，交付时说明缺口，保留已核实的读物。西语与韩语初级优先补最容易读完的文本。
- 首次验收在 test 环境完成，逐页核对书单、来源标注和匿名试读。正式站发布单独安排。

### Selected Reading

| 范围 | 新增书目 |
| --- | --- |
| 中文 B1 | 《一件小事》《匆匆》 |
| 中文 B2 | 《背影》《兔和猫》 |
| 西语 A1 | ¡Me gusta leer!、Contando animales、El fuego、¿Qué estás haciendo? |
| 西语 A2 | Tingi y las vacas、Tom, el vendedor de plátanos、Khalai le habla a las plantas、Castigo |
| 韩语 A1 | 배고픈 악어 |
| 韩语 A2 | 아주 키가 큰 아저씨、자마는 대단해요!、밀랍 아이들、하마는 왜 털이 없을까요?、염소, 개 그리고 소 |
| 韩语 B2 | 만년 셔츠、고향 |

中文和韩语 B2 新书采用维基文库的固定修订版本。西语和韩语初级使用 Storybooks Canada 按篇核实的开放授权版本。每本书的正文和公开试读均保留出处。
