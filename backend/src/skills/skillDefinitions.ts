import type { AspectRatio } from '../types/image.js';

/** Form answers after validation: every field present, text trimmed, lists without blanks. */
export interface SkillValues {
  text(fieldId: string): string;
  list(fieldId: string): string[];
}

interface SkillFieldBase {
  id: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}

export type SkillField =
  | (SkillFieldBase & { kind: 'text'; maxLength: number })
  | (SkillFieldBase & { kind: 'list'; maxLength: number; maxItems: number })
  | (SkillFieldBase & { kind: 'choice'; options: readonly string[]; defaultValue: string });

export interface SkillOutput {
  id: string;
  label: string;
  /** 'auto' follows the shape of the uploaded reference image. */
  aspect: AspectRatio | 'auto' | ((values: SkillValues) => AspectRatio);
  /** What this image is for and how it should look; the planner expands it into a prompt. */
  brief: string;
  /** Text the image must show, taken from the form. Without it the image carries no text. */
  texts?: (values: SkillValues) => string[];
}

export interface SkillDefinition {
  id: string;
  label: string;
  description: string;
  reference: 'none' | 'optional' | 'required';
  /** What to upload, shown on the upload slot. */
  referenceLabel?: string;
  fields: readonly SkillField[];
  /** One image per output, generated in this order. */
  outputs: readonly SkillOutput[];
  /** Design guidance for this kind of image, given to the planner. */
  expertise: string;
  /** Short subject for the session title, e.g. the product or brand name. */
  subject: (values: SkillValues) => string;
}

const filled = (...texts: string[]): string[] => texts.filter((text) => text.length > 0);

export const SKILLS: readonly SkillDefinition[] = [
  {
    id: 'ecommerce',
    label: '电商主图',
    description: '填商品和卖点，一次出主图、场景图和卖点图',
    reference: 'optional',
    referenceLabel: '商品图（上传后保留商品原样）',
    fields: [
      {
        id: 'product',
        label: '商品名称',
        kind: 'text',
        required: true,
        maxLength: 30,
        placeholder: '如：山川明前绿茶',
      },
      {
        id: 'points',
        label: '卖点',
        kind: 'list',
        maxItems: 3,
        maxLength: 16,
        placeholder: '如：高山云雾',
      },
      {
        id: 'price',
        label: '价格文字',
        kind: 'text',
        maxLength: 16,
        placeholder: '如：到手价 ¥199',
      },
      { id: 'badge', label: '促销标签', kind: 'text', maxLength: 10, placeholder: '如：限时特惠' },
      {
        id: 'style',
        label: '风格',
        kind: 'choice',
        options: ['简约白底', '生活场景', '节日促销', '高端质感'],
        defaultValue: '简约白底',
      },
    ],
    outputs: [
      {
        id: 'main',
        label: '主图',
        aspect: '1:1',
        brief:
          '电商平台商品主图，商品居中占画面约六成，干净背景与柔和棚拍光，构图饱满，在列表页一眼就能看清商品',
        texts: (values) => filled(values.text('badge'), values.text('price')),
      },
      {
        id: 'scene',
        label: '场景图',
        aspect: '1:1',
        brief: '商品在真实使用场景中的氛围图，突出质感与生活感，背景虚化有层次',
      },
      {
        id: 'points',
        label: '卖点图',
        aspect: '3:4',
        brief: '商品卖点详情图，商品在一侧，另一侧用简洁的图标和分区排版逐条列出卖点',
        texts: (values) => values.list('points'),
      },
    ],
    expertise:
      '电商图要让商品是绝对主角：主体清晰、边缘干净、光线均匀；文字只放价格、促销和卖点这类信息，排版有层级、留足边距，不要遮挡商品。',
    subject: (values) => values.text('product'),
  },
  {
    id: 'poster',
    label: '活动海报',
    description: '填活动信息，一次出竖版海报、朋友圈方图和横幅',
    reference: 'optional',
    referenceLabel: '品牌元素或产品图（可选）',
    fields: [
      {
        id: 'title',
        label: '主标题',
        kind: 'text',
        required: true,
        maxLength: 12,
        placeholder: '如：周年庆典',
      },
      {
        id: 'offer',
        label: '优惠内容',
        kind: 'text',
        maxLength: 20,
        placeholder: '如：全场第二件半价',
      },
      {
        id: 'time',
        label: '活动时间',
        kind: 'text',
        maxLength: 24,
        placeholder: '如：11月1日至11月7日',
      },
      {
        id: 'brand',
        label: '门店或品牌',
        kind: 'text',
        maxLength: 16,
        placeholder: '如：山川茶事',
      },
      {
        id: 'style',
        label: '风格',
        kind: 'choice',
        options: ['喜庆热闹', '简约高级', '清新自然', '国潮'],
        defaultValue: '喜庆热闹',
      },
    ],
    outputs: [
      {
        id: 'portrait',
        label: '竖版海报',
        aspect: '3:4',
        brief:
          '门店活动竖版海报，主标题大而醒目位于上部，优惠信息次之，时间和品牌在底部，视觉元素烘托活动氛围',
        texts: (values) =>
          filled(
            values.text('title'),
            values.text('offer'),
            values.text('time'),
            values.text('brand'),
          ),
      },
      {
        id: 'square',
        label: '朋友圈方图',
        aspect: '1:1',
        brief: '适合朋友圈和社群转发的方形活动图，主标题与优惠信息居中突出，画面简洁有冲击力',
        texts: (values) => filled(values.text('title'), values.text('offer')),
      },
      {
        id: 'banner',
        label: '横幅',
        aspect: '16:9',
        brief: '门店屏幕或公众号头图用的横版活动横幅，左侧文字区、右侧主视觉，信息一眼可读',
        texts: (values) => filled(values.text('title'), values.text('offer'), values.text('time')),
      },
    ],
    expertise:
      '海报讲究信息层级：主标题最大最醒目，优惠其次，时间和品牌最小；配色与活动调性一致，文字区背景干净保证可读，每段文字只出现一次。',
    subject: (values) => filled(values.text('brand'), values.text('title')).join(' '),
  },
  {
    id: 'background',
    label: '商品换背景',
    description: '上传商品图，商品原样不动，一次出三种构图的新背景',
    reference: 'required',
    referenceLabel: '商品图',
    fields: [
      {
        id: 'scene',
        label: '新背景',
        kind: 'text',
        required: true,
        maxLength: 40,
        placeholder: '如：清晨阳光下的大理石台面，旁边有绿植',
      },
      {
        id: 'mood',
        label: '氛围',
        kind: 'choice',
        options: ['明亮清新', '温暖居家', '高级暗调', '户外自然'],
        defaultValue: '明亮清新',
      },
    ],
    outputs: [
      {
        id: 'front',
        label: '原角度',
        aspect: 'auto',
        brief:
          '保持商品的位置和角度不变，只把背景换成新的场景，光影与新场景自然融合，加入真实的接触阴影',
      },
      {
        id: 'close',
        label: '近景',
        aspect: 'auto',
        brief: '同一商品放进新场景的近景构图，商品更大更突出，背景大幅虚化',
      },
      {
        id: 'wide',
        label: '远景氛围',
        aspect: 'auto',
        brief: '同一商品放进新场景的远景构图，展示更多环境与氛围，商品在画面中依然清晰可辨',
      },
    ],
    expertise:
      '换背景最重要的是商品本身一点都不能变：外观、颜色、包装文字和比例都与参考图一致；新背景的光线方向和色温要与商品匹配，并有真实的投影和反光。',
    subject: (values) => values.text('scene'),
  },
  {
    id: 'social',
    label: '社媒封面',
    description: '填标题和平台，一次出实拍、插画、大字报三种封面',
    reference: 'optional',
    referenceLabel: '配图素材（可选）',
    fields: [
      {
        id: 'title',
        label: '标题',
        kind: 'text',
        required: true,
        maxLength: 14,
        placeholder: '如：周末去哪儿',
      },
      {
        id: 'subtitle',
        label: '副标题',
        kind: 'text',
        maxLength: 20,
        placeholder: '如：5 个城市近郊好去处',
      },
      {
        id: 'platform',
        label: '平台',
        kind: 'choice',
        options: ['小红书', '抖音', '公众号'],
        defaultValue: '小红书',
      },
    ],
    outputs: [
      {
        id: 'photo',
        label: '实拍风',
        aspect: (values) => platformAspect(values),
        brief: '生活感实拍风格封面，真实自然的场景照片，留出大面积干净区域放标题',
        texts: (values) => filled(values.text('title'), values.text('subtitle')),
      },
      {
        id: 'illustration',
        label: '插画风',
        aspect: (values) => platformAspect(values),
        brief: '扁平插画风格封面，色彩明快，图形简洁，标题醒目',
        texts: (values) => filled(values.text('title'), values.text('subtitle')),
      },
      {
        id: 'bold',
        label: '大字报',
        aspect: (values) => platformAspect(values),
        brief: '大字报风格封面，纯色或渐变背景，超大标题占据画面主体，对比强烈',
        texts: (values) => filled(values.text('title'), values.text('subtitle')),
      },
    ],
    expertise:
      '社媒封面要在信息流里一眼抓住人：标题字大、对比强、不超过两行；画面主体和标题互不遮挡，整体风格符合平台调性。',
    subject: (values) => values.text('title'),
  },
  {
    id: 'logo',
    label: '品牌 Logo',
    description: '填品牌名和行业，一次出四个不同方向的 Logo',
    reference: 'none',
    fields: [
      {
        id: 'name',
        label: '品牌名',
        kind: 'text',
        required: true,
        maxLength: 10,
        placeholder: '如：山川茶事',
      },
      {
        id: 'nameEn',
        label: '英文名',
        kind: 'text',
        maxLength: 24,
        placeholder: '如：SHANCHUAN TEA',
      },
      {
        id: 'industry',
        label: '行业',
        kind: 'text',
        required: true,
        maxLength: 16,
        placeholder: '如：新中式茶饮',
      },
      {
        id: 'tone',
        label: '调性',
        kind: 'choice',
        options: ['现代简约', '温暖亲和', '科技感', '国风'],
        defaultValue: '现代简约',
      },
    ],
    outputs: [
      {
        id: 'combo',
        label: '图形加字标',
        aspect: '1:1',
        brief: '图形标志与品牌文字组合的 Logo，图形在上或在左，纯色背景，扁平矢量风格',
        texts: (values) => filled(values.text('name'), values.text('nameEn')),
      },
      {
        id: 'wordmark',
        label: '纯字标',
        aspect: '1:1',
        brief: '只用品牌名做字体设计的字标 Logo，字形有辨识度，纯色背景，扁平矢量风格',
        texts: (values) => filled(values.text('name')),
      },
      {
        id: 'badge',
        label: '徽章式',
        aspect: '1:1',
        brief: '圆形或盾形徽章式 Logo，品牌名环绕或居中，适合门店招牌和包装，纯色背景',
        texts: (values) => filled(values.text('name'), values.text('nameEn')),
      },
      {
        id: 'symbol',
        label: '极简符号',
        aspect: '1:1',
        brief: '只有一个极简图形符号的 Logo，体现行业特征，纯色背景，扁平矢量风格',
      },
    ],
    expertise:
      'Logo 要简洁、可缩放、小尺寸下依然清晰：用平面矢量风格，颜色不超过三种，不要写实照片质感和复杂背景；图形要与行业和调性相关。',
    subject: (values) => values.text('name'),
  },
  {
    id: 'infographic',
    label: '信息图',
    description: '填标题和步骤，一次出竖版和横版两张图解',
    reference: 'none',
    fields: [
      {
        id: 'title',
        label: '标题',
        kind: 'text',
        required: true,
        maxLength: 16,
        placeholder: '如：三步完成注册',
      },
      {
        id: 'steps',
        label: '步骤或要点',
        kind: 'list',
        required: true,
        maxItems: 5,
        maxLength: 12,
        placeholder: '如：下载应用',
      },
      {
        id: 'style',
        label: '风格',
        kind: 'choice',
        options: ['扁平清新', '商务蓝', '手绘可爱'],
        defaultValue: '扁平清新',
      },
    ],
    outputs: [
      {
        id: 'vertical',
        label: '竖版',
        aspect: '3:4',
        brief: '竖版信息图，标题在顶部，各步骤自上而下用编号、图标和箭头串联，分区清晰',
        texts: (values) => [values.text('title'), ...values.list('steps')],
      },
      {
        id: 'horizontal',
        label: '横版',
        aspect: '16:9',
        brief: '横版信息图，标题在上方，各步骤从左到右排列，用编号、图标和连接线串联',
        texts: (values) => [values.text('title'), ...values.list('steps')],
      },
    ],
    expertise:
      '信息图的重点是看得懂：每个步骤配一个简单图标和编号，顺序明确，留白充足，字号统一，背景干净不花哨。',
    subject: (values) => values.text('title'),
  },
  {
    id: 'product',
    label: '产品渲染',
    description: '填产品和材质，一次出主视觉、细节特写和场景图',
    reference: 'optional',
    referenceLabel: '产品照片或草图（可选）',
    fields: [
      {
        id: 'product',
        label: '产品',
        kind: 'text',
        required: true,
        maxLength: 24,
        placeholder: '如：无线降噪耳机',
      },
      {
        id: 'material',
        label: '材质',
        kind: 'choice',
        options: ['金属', '磨砂', '玻璃', '陶瓷', '木质'],
        defaultValue: '金属',
      },
      {
        id: 'label',
        label: '标签文字',
        kind: 'text',
        maxLength: 16,
        placeholder: '如：Pro Series',
      },
    ],
    outputs: [
      {
        id: 'hero',
        label: '主视觉',
        aspect: '4:3',
        brief: '高端产品主视觉渲染图，产品居中略带仰角，深色或渐变背景，柔和轮廓光与地面倒影',
        texts: (values) => filled(values.text('label')),
      },
      {
        id: 'detail',
        label: '细节特写',
        aspect: '1:1',
        brief: '产品材质与工艺的微距特写，突出表面质感、接缝和光泽',
      },
      {
        id: 'lifestyle',
        label: '场景图',
        aspect: '16:9',
        brief: '产品在高级生活场景中的渲染图，环境简约有设计感，产品是视觉焦点',
      },
    ],
    expertise:
      '产品渲染追求真实的材质与光影：用摄影棚布光（主光、轮廓光、补光），表面反射和高光符合材质特性，背景克制，不要杂乱的道具。',
    subject: (values) => values.text('product'),
  },
  {
    id: 'restyle',
    label: '风格重绘',
    description: '上传一张图，构图不变，一次出水彩、动漫、油画三种画风',
    reference: 'required',
    referenceLabel: '要重绘的图片',
    fields: [
      {
        id: 'extra',
        label: '补充要求',
        kind: 'text',
        maxLength: 40,
        placeholder: '如：色调偏暖，保留人物表情',
      },
    ],
    outputs: [
      {
        id: 'watercolor',
        label: '水彩',
        aspect: 'auto',
        brief: '保留参考图的构图、主体和姿态，把整体画风改成清新的水彩插画，柔和的笔触与留白',
      },
      {
        id: 'anime',
        label: '日系动漫',
        aspect: 'auto',
        brief: '保留参考图的构图、主体和姿态，把整体画风改成日系动漫风格，干净的线条与明亮的上色',
      },
      {
        id: 'oil',
        label: '油画',
        aspect: 'auto',
        brief: '保留参考图的构图、主体和姿态，把整体画风改成古典油画，厚重的笔触与丰富的光影',
      },
    ],
    expertise:
      '重绘只改画风不改内容：构图、人物姿态与表情、物体位置都与参考图一致，只改变笔触、上色和质感。',
    subject: (values) => values.text('extra') || '水彩、动漫、油画',
  },
];

const PLATFORM_ASPECTS: Record<string, AspectRatio> = {
  小红书: '3:4',
  抖音: '9:16',
  公众号: '16:9',
};

function platformAspect(values: SkillValues): AspectRatio {
  return PLATFORM_ASPECTS[values.text('platform')] ?? '3:4';
}

export function findSkill(id: string): SkillDefinition | undefined {
  return SKILLS.find((skill) => skill.id === id);
}
