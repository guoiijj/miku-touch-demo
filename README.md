# 初音未来 · 衣橱工作室

把原先的 `miku_rig.glb` 做成可换装、可做动作的独立版本。本包是整理后的可运行源码包，已包含本地 Three.js、运行模型和 VRM 展厅资源。

## 分享包内容

- 换装主页面：`index.html`、`styles.css`、`src/`
- VRM 展厅：`vrm.html`、`vendor/three-vrm/`、`models/miku_vrm.vrm`、`models/vrma/`
- 运行模型：`models/miku_rig.glb`（Draco 压缩）
- 本地静态服务器：`serve.mjs`、`启动.bat`
- Blender 工程和成品 GLB 不在本包内，见同一下载页的 `GitHub-Miku-Blender` 压缩包。

## 打开方式

需要 Node.js 18 或更新版本。

- 双击 `启动.bat`，浏览器会自动打开 `http://127.0.0.1:8899/`。
- 也可以在本目录运行 `node serve.mjs`，再手动打开终端里显示的地址。

模型已用 Draco 压缩到约 8.9 MB，比原文件小约 85%，首次载入明显更快。页面完全在本地运行，不上传模型，也不调用外部生成服务。

## 当前能力

- 6 套完整造型：公式解构、午夜礼装、樱色和装、机能短夹克、奶油居家、月白舞台。
- 每套造型都可单独覆盖主色和配色，不依赖重新导入模型。
- 自然语言换装：中文里同时说颜色、衣型和动作即可。
- 6 种动作：待机、挥手、转身、定格、伸展、舞步；肩、肘、腕、髋、膝、脚和重心会一起变化。
- 拖动旋转视角，滚轮缩放，双击回到正面；键盘 `1` 到 `6` 可切换动作。

可以直接试这些句子：

- `换成粉色的樱花和装`
- `黑金午夜礼装，再转一圈`
- `蓝色机能短夹克，挥挥手`
- `米白居家卫衣，站好`
- `月白舞台长裙，摆个姿势`

## 开源 VRM 展厅

除换装页外，另有一个独立展厅 `vrm.html`，用于查看原始 VRM 模型与动态效果。

- 渲染：[pixiv/three-vrm](https://github.com/pixiv/three-vrm) `3.5.5`，本地安装，不依赖 CDN。
- 模型：`Tda式初音ミクV4X`（许可请以原发布页为准），放在 `models/miku_vrm.vrm`。
- 动作：5 段开源 VRMA（打招呼、挥手、拍手、舞步、骑马舞），来自 [ruslanmv/3D-Avatar-Chatbot](https://github.com/ruslanmv/3D-Avatar-Chatbot)（Apache-2.0），用 [vrm-c/bvh2vrma](https://github.com/vrm-c/bvh2vrma) 转换；播放器为 [pixiv/three-vrm-animation](https://github.com/pixiv/three-vrm-animation) `3.5.5`。
- 动作细节：抬膝、跳跃和转身时按髋部骨骼基准校正整段高度，避免模型上下漂移；拍手片段裁掉了原动作开头和结尾的坐姿。
- 物理：使用 `three-vrm` 自带的 `VRMSpringBoneManager`，为头发、裙摆和领带配置 82 个弹簧关节与 27 个碰撞锚点（手臂、前臂、手、髋、大腿、小腿、上胸），没有自写布料算法。
- 裙摆：抬膝较高时会与大腿胶囊保持距离，减少裙片夹进腿里；属于游戏级近似，不是逐片布料模拟。
- 交互：动作按钮可随时切换，一次性动作播完自动回到待机；拖动旋转、滚轮缩放，右上角可返回衣橱。

## Blender 动画工程

Blender 主场景、纯角色 GLB、六张渲染图和回读验收图在单独的 `GitHub-Miku-Blender` 压缩包中，避免源码包过大。下载页同属一个 Release。
## 改造要点

- 衣层是绑定到原骨架上的独立 `SkinnedMesh`，不是给整张贴图重新上色。
- 身体中心沿用原模型的 `z≈0.168`，避免新衣片被原衬衫和短裙从正面穿出。
- 长裙覆盖处只隐藏原短裙，裙摆下方保留腿部与长袜，鞋面不会悬空；长袖覆盖处隐藏原上臂和腋下拉伸面。
- 袖子沿绑定姿态下的肩、肘、腕骨骼生成，并做袖口收束，抬臂时不会像 T-pose 圆筒一样悬空。
- 挥手记录自己的动作时长，起手、保持、收手分三段插值；肩肘不再互相抢角度。
- 伸展是双臂上举的 V 形，保留左右高低差和肘弯，不靠拉长脖子或肩线把手臂“推”高。
- 舞步每帧按鞋底最低点贴地校正，换重心和抬脚时不会整体悬空，也不会穿进地面。
- 整体界面改用米白纸张、墨黑排版和衬线标题，去掉原来的荧光面板和“AI 展示页”观感。

## GitHub 参考

没有找到成熟的“初音未来专用换装”开源项目，因此衣层和中文意图解析是本地实现的。以下项目主要提供了思路：

- [ruslanmv/3D-Wardrobe-Forge](https://github.com/ruslanmv/3D-Wardrobe-Forge)：VRM 服装生成、衣层组织、合身检查报告。这里借鉴了“衣层独立、合身结果可检查”的工程拆分，没有调用它的生成服务。
- [saori-eth/vrm-mixamo-retargeter](https://github.com/saori-eth/vrm-mixamo-retargeter)：Three.js 下 VRM 与 Mixamo 骨骼重定向。这里借鉴了骨骼命名映射和动作重定向思路。
- [ruslanmv/3D-Avatar-Chatbot](https://github.com/ruslanmv/3D-Avatar-Chatbot)：提供展厅使用的开源 BVH 动作片段，Apache-2.0。
- [vrm-c/bvh2vrma](https://github.com/vrm-c/bvh2vrma)：把 BVH 转成 VRMA 的转换工具。
- [pixiv/three-vrm-animation](https://github.com/pixiv/three-vrm-animation)：展厅的 VRMA 动作播放器，随 `three-vrm` 本地安装。

## 文件结构

- `models/miku_rig.glb`：运行时使用的绑定模型，几何数据已用 Draco 压缩。
- `src/wardrobe.js`：六套造型、衣层、袖子、裙摆、材质与遮挡。
- `src/rig.js`：动作、重心和四肢协调。
- `src/modelCharacter.js`：读取原模型、骨骼代理和毛发重绑定。
- `src/intent.js`：中文颜色、衣型、动作解析及回复文案。
- `src/main.js`：舞台、相机、灯光、造型册和自然语言入口。
- `vendor/three/`：本地 Three.js，不依赖 CDN。

## 已知边界

这是风格化的分层衣装，不是物理布料模拟；极端抬臂或转身时，超长双马尾仍可能与袖子短暂交叠。VRM 展厅的裙摆同样是弹簧近似，快速抬膝时仍可能出现少量裙片压腿，已通过加大碰撞半径把明显穿模压下去。要增加新衣型，优先在 `wardrobe.js` 里新增衣层，再把它加入 `OUTFITS` 的 `layers`。
