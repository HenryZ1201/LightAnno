# 多模态端侧 UI 布局纯视觉标注工具 (Web-based Annotation Tool)
**项目定位：** 一款轻量级、B/S 架构的本地/服务器部署标注工具，专为构建“原生多模态 UI 版式分析”数据集设计。支持高吞吐量的图片数据流洗刷、多级层级标签（Tag Tree）管理以及高精度的多栏边界坐标（归一化 0~1）提取。

---

## 🛠️ 1. 技术栈要求 (Tech Stack)
本项目需采用前后端分离的 B/S 架构，确保在 Linux 服务器端无头部署，并在任意客户端（如 MacBook 浏览器）流畅交互。

* **后端 (Backend):** Python 3.10+, FastAPI (异步非阻塞 IO), Pydantic (数据校验), Uvicorn。
* **前端 (Frontend):** Vue 3 (Composition API, `<script setup>`), Fabric.js 或原生 HTML5 Canvas (用于图片渲染与参考线交互), Tailwind CSS (原子化 UI 快速构建)。
* **部署 (Infrastructure):** Docker, Docker-compose (需支持目录挂载映射物理数据集)。

### 环境依赖与跨平台支持

* **操作系统：** 官方支持 Linux 与 macOS；Windows 建议通过 WSL2 使用。服务器部署优先 Linux。
* **Python：** Python 3.10+，用于 FastAPI 后端；图片可读性校验需使用 Pillow。
* **Node.js：** Node.js 20 LTS+，用于 Vue 3 / Vite 前端开发与构建。
* **Docker：** Docker 24+ 与 Docker Compose v2，用于一键启动前后端并挂载本地数据集目录。
* **浏览器：** Chrome、Edge、Safari、Firefox 等现代浏览器，需支持 Canvas 与常规键盘/鼠标事件。
* **跨平台策略：** 核心采用 B/S 架构，前端运行在浏览器，后端仅负责文件系统代理、metadata 读写与图片静态服务。通过 Docker Compose 封装运行环境，提升 Linux、macOS 与 Windows WSL2 的一致性。
* **路径注意事项：** 数据集路径在 metadata 中统一保存为相对路径；宿主机绝对路径只用于 Docker volume 或本地配置，避免跨平台路径分隔符和盘符差异影响标注数据。

---

## 📁 2. 核心数据架构 (Data Schema)
所有标注状态和元数据必须防抖（Debounce）持久化写入工作区根目录的 `metadata.json` 中。当前工具面向单用户使用，但后端写入时仍应先保留上一版 `metadata.backup.json`，再采用“临时文件 + 原子替换”的方式保存最新 `metadata.json`，避免进程中断导致 JSON 损坏。

### 数据集目录规则

* 数据集根目录下每个 Sample 必须是一个文件夹，且文件夹内**有且只有一张图片**。
* 图片需支持常见格式：`png`, `jpg`, `jpeg`, `webp`, `bmp` 等。
* Sample 文件夹内大概率包含控件树文件（CUE Data），格式可能是 `json` 或 `jsonl`，但允许缺失。控件树缺失时返回 warning，但样本仍进入正常标注流，后续基于纯图片信息分类和识别边界。
* 控件树文件识别规则：优先匹配文件名中包含 `cuedata` 的 `json` / `jsonl` 文件，匹配时不区分大小写。若匹配到多个控件树候选文件，返回 `MULTIPLE_CUE_DATA_FILES` warning。
* Sample 文件夹内不能包含子文件夹。
* 多图片、缺图片、存在子文件夹、图片格式不支持、图片不可读等问题会导致 Sample 被跳过；控件树缺失只返回 warning，不跳过。
* 不满足规则的 Sample 应在初始化扫描时返回结构化 Warning。Warning 至少覆盖：空文件夹、多图片、缺图片、存在子文件夹、多个控件树文件、图片格式不支持、图片不可读、控件树缺失。
* 产品交互和数据管理行为若未特殊说明，优先参考 Adobe Lightroom 的相册/标签/筛选逻辑。

结构化 Warning 示例：

```json
{
  "sample_path": "dataset/app_a/sample_0002",
  "code": "MULTIPLE_IMAGES",
  "level": "warning",
  "message": "Sample 文件夹内存在多张图片，已跳过该样本。",
  "details": {
    "image_files": ["a.png", "b.jpg"]
  }
}
```

Warning code 建议至少包含：`EMPTY_FOLDER`, `MISSING_IMAGE`, `MULTIPLE_IMAGES`, `HAS_SUBDIRECTORY`, `UNSUPPORTED_IMAGE_FORMAT`, `INVALID_IMAGE_FILE`, `UNREADABLE_IMAGE`, `MISSING_CUE_DATA`, `MULTIPLE_CUE_DATA_FILES`。

**Pydantic / TypeScript Interface 参考模型：**
```json
{
  "project_name": "multimodal_layout_v3",
  "tag_tree": {
    "ecommerce": {
      "label": "电商",
      "color": "#FF9900",
      "children": {
        "cart": {"label": "购物车", "children": {}}
      }
    }
  },
  "samples": {
    "sample_0001": {
      "sample_id": "sample_0001",
      "sample_path": "dataset/app_a/sample_0001",
      "image_file": "dataset/app_a/sample_0001/screenshot.png",
      "cue_data_file": "dataset/app_a/sample_0001/tree.json",
      "status": "labeled", 
      "layout_type": "dual", 
      "boundaries": [0.5000, 0], 
      "tags": ["ecommerce/cart"] 
    }
  }
}

```

*注：`status` 枚举值为 `unlabeled`, `labeled`, `flagged`。`layout_type` 枚举值为 `single`, `dual`, `triple`。*

### 字段约束

* `samples` 字典的 key 使用 `sample_id`。`sample_id` 由后端根据初始 `sample_path` 生成，建议使用路径 hash 或路径派生值，避免不同目录下同名文件夹冲突。
* Sample 的业务主标识为 `sample_path`。API 允许按 `sample_path` 定位样本；后端内部可用 `sample_id` 作为 metadata 字典索引。
* `sample_id` 创建后保持稳定。归档、移动或恢复 Sample 时，只更新 `sample_path`、`image_file`、`cue_data_file` 和相关状态字段，不重新生成 `sample_id`。
* 控件树字段全项目统一命名为 `cue_data_file`，不使用 `CUEData_file`。
* `image_file` 与 `cue_data_file` 均为相对于数据集根目录或工作区根目录的路径，且二者必须位于同一个 Sample 文件夹内。若控件树缺失，`cue_data_file` 为 `null`。
* 图片合法性先按扩展名筛选；必要时后端使用 Pillow 校验图片是否可读。扩展名不支持返回 `INVALID_IMAGE_FILE`，文件无法读取或解析返回 `UNREADABLE_IMAGE`。
* `boundaries` 固定为二维数组：
  * `single`: `[0, 0]`
  * `dual`: `[x1_norm, 0]`
  * `triple`: `[x1_norm, x2_norm]`
* 边界坐标永远相对于原图宽度归一化，而不是相对于 Canvas 显示宽度。所有非零边界值保留 4 位小数。
* `dual` 模式下需满足 `0 < x1_norm < 1`。
* `triple` 模式下需满足 `0 < x1_norm < x2_norm < 1`，且 `x1_norm <= x2_norm - 0.02`。
* `layout_type` 与 `boundaries` 的一致性以后端校验为准。前端必须提交合法组合；若请求中的二者不匹配，后端应返回 422，不应静默修正。
* 删除 Tag Tree 节点时采用级联删除：删除某个标签后，所有已标注样本中的该标签也同步移除，行为参考 Lightroom。
* 重命名 Tag Tree 节点时需区分“显示名”和“路径”：修改 `label` 只改变显示名，不改变样本 tags；若重命名标签路径，则所有样本 tags 中对应路径必须同步更新。
* `metadata.json` 是默认工作产物，同时需要提供显式备份和导出功能，方便训练数据集构建与版本留存。

---

## 🔌 3. 后端 API 接口定义 (FastAPI)

后端仅作为本地文件系统代理，不参与图像像素计算。

1. `GET /api/workspace/init`: 扫描挂载的数据集目录，识别有效 Sample 与无效 Sample，读取并返回全局 `metadata.json`、样本列表和结构化 warnings。
2. `GET /api/images/{sample_id}`: 静态路由，返回具体 Sample 目录下的截图原图。
3. `POST /api/metadata/update`: 接收前端单图标注增量 patch，按 `sample_path` 或 `sample_id` 定位样本，只更新传入字段，更新内存字典并持久化 JSON。
4. `POST /api/metadata/batch`: 处理看板页的大批量操作（如批量追加/移除标签、批量修改 layout_type）。批量接口应返回每个 Sample 的处理结果与 warning；单个失败不应阻断其他有效样本。
5. `POST /api/workspace/move`: 物理移动指定的 Sample 文件夹至 `_archive` 或 `_trash`，并同步更新元数据路径。
6. `POST /api/metadata/backup`: 手动创建一份带时间戳的 metadata 备份文件，例如 `metadata.backup.20260616-163000.json`。
7. `GET /api/metadata/export`: 导出当前 metadata，用作最终数据集标注产物。默认导出 JSON，后续可扩展为 JSONL。需支持导出全部有效样本或仅导出当前筛选结果。

### API 请求语义

`/api/metadata/update` 示例请求体：

```json
{
  "sample_path": "dataset/app_a/sample_0001",
  "patch": {
    "status": "labeled",
    "layout_type": "dual",
    "boundaries": [0.5123, 0],
    "tags": ["ecommerce/cart"]
  }
}
```

`/api/workspace/move` 需明确移动后语义：

* 移动到 `_archive`：从默认 Grid 中隐藏，但 metadata 保留，可通过筛选查看或恢复。
* 移动到 `_trash`：从默认 Grid 中隐藏，metadata 保留删除状态，暂不物理删除，允许后续恢复。
* 移动后 `sample_id` 不变，只更新 `sample_path`、`image_file`、`cue_data_file` 和归档/删除状态。

`/api/metadata/export` 导出语义：

* 默认导出完整 `metadata.json`，包括 `project_name`、`tag_tree`、`samples` 和必要的导出时间信息。
* 支持根据前端当前筛选条件导出子集，例如仅导出 `status=labeled`、`layout_type=dual`、指定 tags、指定路径关键词或无缺陷样本。
* 导出结果应保留相对路径、固定二维 `boundaries`、`layout_type`、`status`、`tags`、`image_file`、`cue_data_file` 等训练所需字段。
* 导出接口不修改当前工作区状态。

---

## 🖥️ 4. 前端核心模块与交互需求 (Vue 3 + Canvas)

### 模块 A：全局侧边栏 (Sidebar - 标签树管理)

* 渲染无限极折叠标签树（Tag Tree）。
* 支持右键菜单（Context Menu）进行 CRUD：新建子标签、重命名、删除、修改颜色。
* 删除标签节点时采用级联删除：同步移除所有样本上的该标签，并在执行前提示受影响样本数量。
* 在 Grid 模式下，勾选标签树节点可触发对应标签的过滤检索。

### 模块 B：数据看板 (Grid View - 瀑布流)

* **UI呈现：** 缩略图瀑布流，图片边角需有状态指示灯（🟢已标、🟡存疑、⚪未标）与版式角标。
* **筛选能力：** 支持按 `tags`、`layout_type`、`status`、是否缺少 `cue_data_file`、是否 archived/trashed 进行筛选。
* **组合筛选：** 支持多个筛选条件同时生效，例如“已标注 + 双栏 + 指定标签 + 缺控件树”。
* **搜索能力：** 支持按 `sample_path`、`image_file`、`cue_data_file`、文件名关键词进行元数据搜索。
* **缺陷面板：** 集中展示初始化扫描和后续操作产生的 warnings/errors，例如缺控件树、多图跳过、不可读图片、存在子文件夹等；点击缺陷项可定位到对应 Sample 或无效目录。
* **交互逻辑：** 支持 `Ctrl/Cmd` 点选、`Shift` 连选、鼠标拖拽框选。
* **批量操作：** 选中多图后，右键或通过底部操作栏，实现“批量追加/移除标签”、“批量设为单/双/三栏”、“批量标记为异常”。
* **批量同步当前图设置：** 在 Detail 或 Grid 中以当前图片为源，将当前图片的 `tags`、`layout_type`、`boundaries`、`status` 中的指定字段同步到选中的多张图片。
* **筛选导出：** 支持将当前筛选结果导出为 metadata 子集，用于后续训练或抽查。

### 模块 C：详情标注 (Detail View - 单图工作区)

* **交互底座：** 使用 Fabric.js 渲染高分辨率原图。右侧展示当前图片的详细属性与标签输入框（支持模糊搜索补全）。
* **快捷键流：**
* `1`, `2`, `3`：切换版式（单、双、三栏）。
* `← / →` 或 `A / D`：上一张/下一张图片。
* `Space`：保存并标记当前图片为已完成。
* `F`：将当前图片标记为存疑 (Flagged)。
* `G`：返回 Grid View，并保留当前筛选条件。


* **边界拖拽与吸附逻辑 (核心开发难点)：**
* 切换为 `dual` 时：在 Canvas 中央 ($X_{norm}=0.5$) 生成一条垂直辅助线。
* 切换为 `triple` 时：在 $X_{norm}=0.33$ 和 $0.66$ 处生成两条垂直辅助线。
* 鼠标悬浮于线条时变为 `↔` 光标。拖拽线条时，旁边需显示一个跟随的 Tooltip 实时呈现归一化坐标（保留 4 位小数）。
* **吸附 (Snap)：** 拖动至 $0.3333, 0.5000, 0.6667$（容差 $\pm 0.02$）时，产生磁吸效果。
* **约束：** 三栏模式下，强制锁定 $X_{norm\_left} \le X_{norm\_right} - 0.02$，防止线段交叉。
* 将拖拽后的像素坐标转换回 $0 \sim 1$ 的相对坐标，防抖 300ms 后调用后端 Update 接口。



---

## 🚀 5. 给 AI Assistant (Claude Code) 的执行指令

**执行策略：** 请遵循以下循序渐进的步骤为我生成代码，不要一次性全部输出，每完成一步请等待我的确认。

1. **Step 1 (脚手架与环境):** 生成 `docker-compose.yml`，后端的 `requirements.txt` 和前端的 `package.json`，搭建基础目录结构。
   * **完成标准：** 可以通过 Docker Compose 或本地命令分别启动后端和前端；后端提供健康检查接口；前端能显示基础页面。
   * **测试方式：** 运行后端健康检查接口返回成功；浏览器打开前端地址能看到应用壳页面。
2. **Step 2 (数据结构与后端):** 使用 Pydantic 定义严格的元数据模型，编写 FastAPI 的完整 CRUD 路由与本地文件操作逻辑。
   * **完成标准：** 能扫描数据集目录，识别有效 Sample 与结构化 warnings；能初始化/读取/备份/原子写入 `metadata.json`；能通过 API 更新单个 Sample、批量更新 Sample、级联删除标签、重命名标签路径并同步样本 tags、移动 Sample 到 `_archive` 或 `_trash`、手动备份 metadata、导出 metadata。
   * **测试方式：** 准备包含空文件夹、多图、子文件夹、缺控件树、多个控件树、非法图片格式、不可读图片的测试数据集，调用 `/api/workspace/init` 后能得到对应 warning；缺控件树样本仍进入正常标注流；调用更新接口后 `metadata.json` 与 `metadata.backup.json` 均符合预期；调用备份和导出接口能得到可读取的 JSON 文件。
3. **Step 3 (前端基础架构):** 搭建 Vue3 页面路由结构（Grid / Detail），实现侧边栏树形组件，并对接后端的 `/init` 和 `/update` 接口。
   * **完成标准：** 前端能展示样本 Grid、warnings、缺陷面板、标签树；能按 `tags`、`layout_type`、`status`、缺控件树状态、归档/删除状态进行筛选；能进行组合筛选和元数据搜索；能进入单图详情页；能修改状态、版式、标签并持久化。
   * **测试方式：** 在浏览器中完成一次标签筛选、分栏筛选、状态筛选、组合筛选和 `sample_path` 搜索；进入详情修改标签/状态/版式并刷新页面，确认修改仍存在；warnings 能在缺陷面板中被用户看见并可定位。
4. **Step 4 (核心 Canvas 交互):** 在 Detail 视图中接入 Fabric.js/原生 Canvas。实现图片的自适应渲染，以及最核心的“垂直参考线拖动、吸附、边界约束和 0~1 坐标转换”逻辑。
   * **完成标准：** 单/双/三栏切换正确生成 `[0, 0]`、`[x1_norm, 0]`、`[x1_norm, x2_norm]`；拖拽参考线时 tooltip 实时显示 4 位小数；吸附与三栏边界约束生效；保存值相对于原图宽度归一化，而不是相对于 Canvas 显示宽度。
   * **测试方式：** 使用不同分辨率图片和不同浏览器缩放比例测试，确认同一视觉边界保存出的归一化坐标一致；拖拽到 0.3333、0.5000、0.6667 附近时能触发吸附。
5. **Step 5 (批量操作与优化):** 完善 Grid 视图的框选与高频批量打标功能，注入全局键盘快捷键监听。
   * **完成标准：** Grid 支持 `Ctrl/Cmd` 点选、`Shift` 连选、拖拽框选；支持批量追加/移除标签、批量修改版式、批量标记异常、批量同步当前图设置；详情页快捷键流可连续标注；支持导出当前筛选结果。
   * **测试方式：** 选中多张样本执行批量标签、批量版式修改和批量同步当前图设置，刷新后结果仍存在；连续使用 `1/2/3`、`Space`、`F`、`G`、`A/D` 或方向键完成多张图片标注；应用筛选条件后导出，确认导出 JSON 仅包含当前筛选结果。

请严格遵守以上需求定义。如果理解无误，请从 **Step 1** 开始输出代码。