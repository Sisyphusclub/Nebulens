# 目标

修复图片详情弹窗在不同图片比例下的左侧黑边、图片贴边和右侧按钮截断问题，统一为固定视口尺寸与可滚动详情布局。

# 范围

- `frontend/src/components/gallery/ImageDetailModal.tsx`
- `frontend/src/styles/base.css`
- 图片详情弹窗相关组件与样式测试

# 非目标

- 不改变图片数据、下载、复用、可见性或删除行为。
- 不改变移动端详情弹窗的纵向全屏交互。

# 验收示例

Scenario: 桌面端打开方图、横图或竖图详情时，弹窗保持固定高度范围，图片完整显示，左侧均匀留白且不被裁切。

Scenario: 详情提示词或参数内容超出可视高度时，中间区域独立滚动，底部五个操作按钮完整可见并固定在面板底部。

Scenario: 窄屏打开详情时，移动端纵向布局继续可用，图片和详情面板不溢出视口。

# 约束与不变量

- 桌面 Modal 使用 `h-[85vh] min-h-[620px] max-h-[760px] w-[90vw] max-w-5xl`。
- 左侧使用 `flex-1 h-full p-8 flex items-center justify-center bg-[#0a0a0a]`，图片使用 `max-w-full max-h-full object-contain rounded-xl shadow-2xl`。
- 右侧固定 `w-[340px] flex-shrink-0 h-full flex flex-col min-h-0 p-5 bg-[#141414]`。
- 中间内容使用 `flex-1 min-h-0 overflow-y-auto`，按钮组使用 `flex-shrink-0 mt-auto pt-3`。

# 决策

- 采用均匀内边距实现画廊卡片质感；不引入额外模糊环境光层。

# 待解决问题

无。

# 验证预期

- 定向组件和 CSS 契约测试覆盖固定尺寸、内边距、contain 图片和底部操作区。
- 运行前端类型检查与生产构建。
