# 目标

修复图片详情弹窗的媒体区黑边和右侧操作按钮截断问题。桌面端弹窗使用稳定的最小/最大尺寸，左侧图片容器无内边距，右侧内容区可独立滚动且底部五个操作按钮始终完整可见。

# 范围

- 调整 `frontend/src/components/gallery/ImageDetailModal.tsx` 的 Tailwind 布局类。
- 保留现有图片、提示词、参数网格、可见性和删除操作行为。

# 非目标

- 不改变图片加载、下载、回调签名或移动端纵向布局行为。
- 不修改全局设计 token 或其他弹窗。

# 验收示例

### Scenario: 1:1 图片无四周悬空黑边

- GIVEN 用户在桌面端打开 1:1 图片详情
- WHEN 图片加载完成
- THEN 左侧媒体容器不包含内边距，图片在容器内完全自适应撑满，四周不留由容器 padding 造成的黑边

### Scenario: 弹窗尺寸满足桌面端保底高度

- GIVEN 用户在桌面端打开图片详情
- WHEN 弹窗渲染
- THEN 根容器同时包含 `min-h-[580px] h-[80vh] max-h-[720px] w-[90vw] max-w-5xl`

### Scenario: 右侧五个操作按钮完整常驻

- GIVEN 提示词或参数内容超过右侧可视高度
- WHEN 用户查看详情弹窗
- THEN 右侧面板使用 `flex flex-col h-full min-h-0 p-5`，中间内容使用 `flex-1 min-h-0 overflow-y-auto space-y-2`，底部按钮包裹层使用 `flex-shrink-0 mt-auto pt-3 space-y-1.5`，五个按钮保持完整可见

# 约束与不变量

- 保留现有操作回调、可见性状态和删除状态。
- 不为图片设置固定比例容器，继续使用 `object-contain`。

# 决策

- 桌面端根容器尺寸按本次需求指定值覆盖旧的 `85vh` 与 `620px/760px` 约束。
- 左侧媒体区改为 `p-0`，右侧面板和内容/操作区采用显式 flex 约束。

# 待解决问题

无。

# 验证预期

- `npm test -- --run tests/components/ImageDetailModal.spec.tsx tests/styles/imageDetailSizing.spec.ts`
