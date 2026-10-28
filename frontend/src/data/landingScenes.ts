import type { AspectChoice } from '@/types/image';

export interface LandingScene {
  label: string;
  aspect: AspectChoice;
  /** A starting prompt; quoted text is what should appear in the image. */
  prompt: string;
}

export const LANDING_SCENES: readonly LandingScene[] = [
  {
    label: '电商主图',
    aspect: '1:1',
    prompt:
      '电商产品主图，产品居中摆放，干净的浅色背景与柔和棚拍光，左上角写“限时特惠”，右下角写“到手价 ¥199”',
  },
  {
    label: '活动海报',
    aspect: '3:4',
    prompt:
      '门店活动海报，喜庆明快的配色与彩带元素，主标题“周年庆典”，副标题“全场第二件半价”，底部写“活动时间 11月1日至11月7日”',
  },
  {
    label: '社媒封面',
    aspect: '3:4',
    prompt:
      '小红书风格封面，生活感实拍画面，留出大面积干净区域，醒目标题“周末去哪儿”，小字“5 个城市近郊好去处”',
  },
  {
    label: '信息图',
    aspect: '3:4',
    prompt:
      '扁平风格信息图，浅色背景与清晰的分区排版，标题“三步完成注册”，三个步骤分别写“下载应用”“验证手机号”“完善资料”',
  },
  {
    label: '产品渲染',
    aspect: '4:3',
    prompt: '高端产品渲染图，金属与磨砂材质，柔和的轮廓光和倒影，产品旁的极简标签写“Pro Series”',
  },
  {
    label: '品牌 Logo',
    aspect: '1:1',
    prompt:
      '简洁现代的品牌 Logo，几何图形与文字组合，纯色背景，中文名“山川茶事”，英文名“SHANCHUAN TEA”',
  },
];
