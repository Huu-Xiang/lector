import { describe, expect, test } from 'bun:test';
import { estimateCefrLevel } from './level-heuristic';

describe('estimateCefrLevel', () => {
  test('short, simple English sentences map to an easier band than long, complex ones', () => {
    const simple =
      'The cat sat on the mat. It was a sunny day. The dog ran to the park. Birds sang in the trees. '.repeat(
        3,
      );
    const complex =
      'Notwithstanding the aforementioned considerations, the committee, having deliberated extensively upon the ramifications of the proposed legislative amendments, ultimately concluded that further comprehensive investigation was warranted before any substantive determination could be reached. '.repeat(
        3,
      );
    const simpleLevel = estimateCefrLevel(simple, 'en');
    const complexLevel = estimateCefrLevel(complex, 'en');
    const order = ['A2', 'B1', 'B2', 'C1'];
    expect(order.indexOf(simpleLevel)).toBeLessThan(order.indexOf(complexLevel));
  });

  test('short, simple French sentences map to an easier band than long, complex ones', () => {
    const simple = 'Le chat est sur le tapis. Il fait beau. Le chien court dans le parc. '.repeat(
      3,
    );
    const complex =
      "Nonobstant les considerations susmentionnees, le comite, apres avoir longuement delibere sur les ramifications des amendements legislatifs proposes, a finalement conclu qu'une enquete approfondie supplementaire etait necessaire. ".repeat(
        3,
      );
    const simpleLevel = estimateCefrLevel(simple, 'fr');
    const complexLevel = estimateCefrLevel(complex, 'fr');
    const order = ['A2', 'B1', 'B2', 'C1'];
    expect(order.indexOf(simpleLevel)).toBeLessThan(order.indexOf(complexLevel));
  });

  test('short, common Chinese sentences map to an easier band than long, formal ones', () => {
    const simple = '我想去你的家。你好吗？我们都很好。他在学校。今天天气很好。'.repeat(4);
    const formal =
      '光合作用是植物、藻类和某些细菌利用叶绿素吸收太阳辐射能，将二氧化碳和水转化为碳水化合物并释放氧气的生物化学过程，其反应机制涉及光反应与暗反应两个相互衔接的阶段。'.repeat(
        3,
      );
    const order = ['A2', 'B1', 'B2', 'C1'];
    expect(order.indexOf(estimateCefrLevel(simple, 'zh'))).toBeLessThan(
      order.indexOf(estimateCefrLevel(formal, 'zh')),
    );
    expect(estimateCefrLevel('hello world', 'zh')).toBe('B1');
  });

  test('empty text falls back to B1 rather than throwing', () => {
    expect(estimateCefrLevel('', 'en')).toBe('B1');
  });
});
