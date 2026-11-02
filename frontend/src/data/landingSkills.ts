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

export interface LandingSkill {
  id: string;
  label: string;
  description: string;
  /** One short line for the compact skill tiles, ten characters at most. */
  tagline: string;
  icon: LucideIcon;
  /** Small example shown on the skill card. */
  image: string;
  /** A one-line brief to type after the skill in the composer, shown as the example. */
  briefExample: string;
}

/** Skills in order of everyday use, which is also their order on the Discover page. */
export const LANDING_SKILLS: readonly LandingSkill[] = [
  {
    id: 'ecommerce',
    label: '电商主图',
    tagline: '主图卖点图一次出',
    description: '说说商品和卖点，一次出主图、场景图和卖点图',
    icon: ShoppingBag,
    image: '/media/skills/ecommerce.jpg',
    briefExample: '山川明前绿茶，高山云雾、手工炒制，到手价 ¥199',
  },
  {
    id: 'poster',
    label: '活动海报',
    tagline: '竖版方图横幅齐活',
    description: '说说活动信息，一次出竖版海报、朋友圈方图和横幅',
    icon: Megaphone,
    image: '/media/skills/poster.jpg',
    briefExample: '周年庆典，全场第二件半价，11月1日至11月7日，山川茶事',
  },
  {
    id: 'background',
    label: '商品换背景',
    tagline: '商品不变换场景',
    description: '上传商品图，商品原样不动，一次出三种构图的新背景',
    icon: Replace,
    image: '/media/skills/background.jpg',
    briefExample: '清晨阳光下的大理石台面，旁边有绿植',
  },
  {
    id: 'social',
    label: '社媒封面',
    tagline: '三种风格任你挑',
    description: '说说标题和平台，一次出实拍、插画、大字报三种封面',
    icon: Smartphone,
    image: '/media/skills/social.jpg',
    briefExample: '周末去哪儿，5 个城市近郊好去处',
  },
  {
    id: 'logo',
    label: '品牌 Logo',
    tagline: '四个方向一起出',
    description: '说说品牌名和行业，一次出四个不同方向的 Logo',
    icon: PenTool,
    image: '/media/skills/logo.jpg',
    briefExample: '山川茶事，新中式茶饮，英文名 SHANCHUAN TEA',
  },
  {
    id: 'infographic',
    label: '信息图',
    tagline: '步骤流程一图讲清',
    description: '说说标题和步骤，一次出竖版和横版两张图解',
    icon: ChartColumn,
    image: '/media/skills/infographic.jpg',
    briefExample: '三步完成注册，下载应用、填写手机号、设置密码',
  },
  {
    id: 'product',
    label: '产品渲染',
    tagline: '高级质感渲染图',
    description: '说说产品和材质，一次出主视觉、细节特写和场景图',
    icon: Box,
    image: '/media/skills/product.jpg',
    briefExample: '无线降噪耳机，标签写 Pro Series',
  },
  {
    id: 'restyle',
    label: '风格重绘',
    tagline: '一键换三种画风',
    description: '上传一张图，构图不变，一次出水彩、动漫、油画三种画风',
    icon: Palette,
    image: '/media/skills/restyle.jpg',
    briefExample: '色调偏暖，保留人物表情',
  },
];
