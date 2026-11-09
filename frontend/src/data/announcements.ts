/**
 * Product announcements shown behind the bell in the top bar, newest first. A static list
 * for now: adding an entry here (with a new id) is all it takes to announce something.
 */
export interface Announcement {
  /** Stable and unique; read state is remembered by it. */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  kind: 'update' | 'notice';
  title: string;
  items: readonly string[];
}

export const ANNOUNCEMENT_KIND_LABELS: Readonly<Record<Announcement['kind'], string>> = {
  update: '更新',
  notice: '通知',
};

export const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    id: '2026-11-08-templates-and-drafts',
    date: '2026-11-08',
    kind: 'update',
    title: '模板更好找，草稿不再丢',
    items: [
      '创作模板的分类全部平铺显示，点一下就能筛选。',
      '模板详情和分类可以直接复制链接发给同事，打开就是同一个模板。',
      '首页输入框下方可以按分类直达模板。',
      '首页和生图页没发送的提示词会自动保存，刷新或离开后回来还在。',
    ],
  },
  {
    id: '2026-11-02-references',
    date: '2026-11-02',
    kind: 'update',
    title: '参考图最多 14 张',
    items: [
      '一次生成最多可以带 14 张参考图，生成页会和提示词一起显示。',
      '参考图生图失败后重试，参考图不会丢。',
      '删除单张图片后 5 秒内可以撤销。',
    ],
  },
  {
    id: '2026-11-02-nano-banana-retired',
    date: '2026-11-02',
    kind: 'notice',
    title: 'Nano Banana Pro 模型已下线',
    items: ['请在模型列表中改用其他模型继续创作。'],
  },
];
