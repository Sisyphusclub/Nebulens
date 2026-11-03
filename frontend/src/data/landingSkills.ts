import {
  Box,
  ChartColumn,
  Clapperboard,
  Factory,
  Megaphone,
  Network,
  Palette,
  PenTool,
  Presentation,
  Replace,
  ShoppingBag,
  Smartphone,
  Target,
  UserRound,
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
  /** What people reach for most: creators' scenes and the company's own, on the Discover page. */
  everyday?: boolean;
}

/**
 * Every skill, offered in the composer's + menu and after typing "/". The everyday ones
 * come first, in the order they appear on the Discover page.
 */
export const LANDING_SKILLS: readonly LandingSkill[] = [
  {
    id: 'social',
    label: '社媒封面',
    tagline: '三种风格任你挑',
    description: '说说标题和平台，一次出实拍、插画、大字报三种封面',
    icon: Smartphone,
    image: '/media/skills/social.jpg',
    briefExample: '周末去哪儿，5 个城市近郊好去处',
    everyday: true,
  },
  {
    id: 'ecommerce',
    label: '电商主图',
    tagline: '主图卖点图一次出',
    description: '说说商品和卖点，一次出主图、场景图和卖点图',
    icon: ShoppingBag,
    image: '/media/skills/ecommerce.jpg',
    briefExample: '山川明前绿茶，高山云雾、手工炒制，到手价 ¥199',
    everyday: true,
  },
  {
    id: 'poster',
    label: '活动海报',
    tagline: '竖版方图横幅齐活',
    description: '说说活动信息，一次出竖版海报、朋友圈方图和横幅',
    icon: Megaphone,
    image: '/media/skills/poster.jpg',
    briefExample: '周年庆典，全场第二件半价，11月1日至11月7日，山川茶事',
    everyday: true,
  },
  {
    id: 'storyboard',
    label: '分镜脚本',
    tagline: '分镜表加关键帧',
    description: '说说故事和镜头，一次出分镜表和一张关键帧',
    icon: Clapperboard,
    image: '/media/templates/gpt-image2/storyboard.webp',
    briefExample: '雨夜重逢，车站远景、撑伞走近、四目相对、转身离开',
    everyday: true,
  },
  {
    id: 'character',
    label: '角色设定',
    tagline: '三视图半身表情',
    description: '说说角色和外貌，一次出三视图、半身像和表情图',
    icon: UserRound,
    image: '/media/templates/gpt-image2/character-sheet.webp',
    briefExample: '赛博朋克女黑客，银色短发、黑色机能风外套',
    everyday: true,
  },
  {
    id: 'restyle',
    label: '风格重绘',
    tagline: '一键换三种画风',
    description: '上传一张图，构图不变，一次出水彩、动漫、油画三种画风',
    icon: Palette,
    image: '/media/skills/restyle.jpg',
    briefExample: '色调偏暖，保留人物表情',
    everyday: true,
  },
  {
    id: 'logo',
    label: '品牌 Logo',
    tagline: '四个方向一起出',
    description: '说说品牌名和行业，一次出四个不同方向的 Logo',
    icon: PenTool,
    image: '/media/skills/logo.jpg',
    briefExample: '山川茶事，新中式茶饮，英文名 SHANCHUAN TEA',
    everyday: true,
  },
  {
    id: 'infographic',
    label: '信息图',
    tagline: '步骤流程一图讲清',
    description: '说说标题和步骤，一次出竖版和横版两张图解',
    icon: ChartColumn,
    image: '/media/skills/infographic.jpg',
    briefExample: '三步完成注册，下载应用、填写手机号、设置密码',
    everyday: true,
  },
  {
    id: 'report',
    label: '汇报封面',
    tagline: '封面目录过渡页',
    description: '说说主题和章节，一次出封面、目录页和章节过渡页',
    icon: Presentation,
    image: '/media/skills/report.jpg',
    briefExample: '2026 年度经营汇报，市场拓展、产品进展、项目交付、明年规划',
    everyday: true,
  },
  {
    id: 'architecture',
    label: '架构图',
    tagline: '分层总览两张图',
    description: '说说系统和各层模块，一次出分层架构图和模块总览图',
    icon: Network,
    image: '/media/skills/architecture.jpg',
    briefExample: '产业数智平台，设备接入层、数据中台、智能应用、运营门户',
    everyday: true,
  },
  {
    id: 'solution',
    label: '方案主视觉',
    tagline: '售前物料一次出',
    description: '说说方案和核心能力，一次出主视觉、能力图和传播方图',
    icon: Target,
    image: '/media/skills/solution.jpg',
    briefExample: '机器人柔性产线方案，换产更快、节拍稳定、远程运维',
    everyday: true,
  },
  {
    id: 'factory',
    label: '产线场景',
    tagline: '车间工位特写',
    description: '说说设备和场景，一次出车间全景、工位中景和细节特写',
    icon: Factory,
    image: '/media/skills/factory.jpg',
    briefExample: '六轴焊接机器人',
    everyday: true,
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
    id: 'background',
    label: '商品换背景',
    tagline: '商品不变换场景',
    description: '上传商品图，商品原样不动，一次出三种构图的新背景',
    icon: Replace,
    image: '/media/skills/background.jpg',
    briefExample: '清晨阳光下的大理石台面，旁边有绿植',
  },
];

export const EVERYDAY_SKILLS = LANDING_SKILLS.filter((skill) => skill.everyday);
