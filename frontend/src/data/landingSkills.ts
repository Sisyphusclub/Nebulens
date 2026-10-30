import {
  Box,
  ChartColumn,
  Megaphone,
  Palette,
  PenTool,
  Replace,
  ShoppingBag,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';

import type { AspectChoice } from '@/types/image';

export interface LandingSkill {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Small example shown on the skill card. */
  image: string;
  aspect: AspectChoice;
  /** Example prompt for writing it yourself; quoted text is what should appear in the image. */
  prompt: string;
  /** Set when the example prompt needs the user's own image; shown as a reminder to attach it. */
  referenceHint?: string;
}

/** Skills in order of everyday use; the first QUICK_SKILL_COUNT also sit under the composer. */
export const LANDING_SKILLS: readonly LandingSkill[] = [
  {
    id: 'ecommerce',
    label: '电商主图',
    description: '填商品和卖点，一次出主图、场景图和卖点图',
    icon: ShoppingBag,
    image: '/media/skills/ecommerce.jpg',
    aspect: '1:1',
    prompt:
      '电商产品主图，产品居中摆放，干净的浅色背景与柔和棚拍光，左上角写“限时特惠”，右下角写“到手价 ¥199”',
  },
  {
    id: 'poster',
    label: '活动海报',
    description: '填活动信息，一次出竖版海报、朋友圈方图和横幅',
    icon: Megaphone,
    image: '/media/skills/poster.jpg',
    aspect: '3:4',
    prompt:
      '门店活动海报，喜庆明快的配色与彩带元素，主标题“周年庆典”，副标题“全场第二件半价”，底部写“活动时间 11月1日至11月7日”',
  },
  {
    id: 'background',
    label: '商品换背景',
    description: '上传商品图，商品原样不动，一次出三种构图的新背景',
    icon: Replace,
    image: '/media/skills/background.jpg',
    aspect: '1:1',
    prompt:
      '保持商品的外观、颜色和文字完全不变，把背景换成清晨阳光下的大理石台面，搭配绿植与柔和投影',
    referenceHint: '先上传一张商品图作为参考图，再开始生成。',
  },
  {
    id: 'social',
    label: '社媒封面',
    description: '填标题和平台，一次出实拍、插画、大字报三种封面',
    icon: Smartphone,
    image: '/media/skills/social.jpg',
    aspect: '3:4',
    prompt:
      '小红书风格封面，生活感实拍画面，留出大面积干净区域，醒目标题“周末去哪儿”，小字“5 个城市近郊好去处”',
  },
  {
    id: 'logo',
    label: '品牌 Logo',
    description: '填品牌名和行业，一次出四个不同方向的 Logo',
    icon: PenTool,
    image: '/media/skills/logo.jpg',
    aspect: '1:1',
    prompt:
      '简洁现代的品牌 Logo，几何图形与文字组合，纯色背景，中文名“山川茶事”，英文名“SHANCHUAN TEA”',
  },
  {
    id: 'infographic',
    label: '信息图',
    description: '填标题和步骤，一次出竖版和横版两张图解',
    icon: ChartColumn,
    image: '/media/skills/infographic.jpg',
    aspect: '3:4',
    prompt:
      '扁平风格信息图，浅色背景与清晰的分区排版，标题“三步完成注册”，三个步骤分别写“下载应用”“验证手机号”“完善资料”',
  },
  {
    id: 'product',
    label: '产品渲染',
    description: '填产品和材质，一次出主视觉、细节特写和场景图',
    icon: Box,
    image: '/media/skills/product.jpg',
    aspect: '4:3',
    prompt: '高端产品渲染图，金属与磨砂材质，柔和的轮廓光和倒影，产品旁的极简标签写“Pro Series”',
  },
  {
    id: 'restyle',
    label: '风格重绘',
    description: '上传一张图，构图不变，一次出水彩、动漫、油画三种画风',
    icon: Palette,
    image: '/media/skills/restyle.jpg',
    aspect: 'auto',
    prompt: '保留参考图的构图、主体和姿态，把整体画风改成清新的水彩插画，柔和的笔触与留白',
    referenceHint: '先上传一张想重绘的图片作为参考图，再开始生成。',
  },
];

export const QUICK_SKILL_COUNT = 5;
