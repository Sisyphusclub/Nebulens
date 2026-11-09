import { expect, it } from 'vitest';

import { promptTitle } from '@/utils/promptTitle';

it('titles a shared piece by the first sentence of its prompt, without the aspect ratio', () => {
  expect(promptTitle('3:4 竖版卖点详情图。商品为山川明前绿茶茶罐，置于浅色背景')).toBe(
    '竖版卖点详情图',
  );
  expect(promptTitle('1:1 生活场景氛围图。茶罐与一只白瓷杯')).toBe('生活场景氛围图');
});

it('falls back to the first clause when the first sentence is still long', () => {
  expect(
    promptTitle('Y2K风格时尚大片，粉色爱心与星星贴纸环绕模特，高饱和闪光灯直打，胶片颗粒'),
  ).toBe('Y2K风格时尚大片');
  // The colon inside a ratio is not a clause break.
  expect(promptTitle('电商平台商品主图，1:1 正方形构图。画面主体是一罐绿茶')).toBe(
    '电商平台商品主图，1:1 正方形构图',
  );
});

it('keeps a short prompt whole and never returns an empty title', () => {
  expect(promptTitle('奶茶新品上市海报，清新绿色')).toBe('奶茶新品上市海报，清新绿色');
  expect(promptTitle('16:9')).toBe('16:9');
});
