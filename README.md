# LightAnno

LightAnno 是一个本地优先的 Web 标注工具，用于构建多模态移动端 UI 布局数据集。后端使用 FastAPI 作为本地文件系统与 metadata 代理，前端使用 Vue 3 实现 Grid 浏览、标签管理、缺陷面板和视觉边界标注。

当前实现状态：核心标注流程已实现。

## 环境要求

- **Windows 10/11**、Linux 或 macOS
- Python 3.10+，用于本地后端开发
- Node.js 20 LTS+，用于本地前端开发
- Docker 24+ 与 Docker Compose v2（可选，用于容器化启动）
- 支持 Canvas 的现代浏览器，例如 Chrome、Edge、Safari、Firefox

## 数据集目录结构

默认将 sample 文件夹放在 `data/` 下：

```text
data/
  app_a/
    sample_0001/
      screenshot.png
      my_cuedata.json
    sample_0002/
      screenshot.jpg
```

每个 sample 文件夹必须有且只有一张支持格式的图片。CUE data 文件可选，格式为 `json` 或 `jsonl`，文件名需要包含 `cuedata`，大小写不敏感。

当前 `docker-compose.yml` 默认挂载：

- `./data` 到容器内 `/data`
- 项目根目录到容器内 `/workspace`

如果要测试其他目录，例如 `data_test/milktea_bill_screenshots`，需要临时修改 `docker-compose.yml` 的 volume，或将 sample 文件夹复制/移动到 `data/` 下。

## Docker 启动

```bash
docker compose up --build
```

启动后打开：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:8000/api/health`

停止服务：

```bash
docker compose down
```

## 本地开发

### 场景一：前后端都在 Windows 本地运行

**后端启动：**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端将在 `http://localhost:8000` 运行。

**前端启动：**

```powershell
cd frontend
npm install
npm run dev
```

前端将在 `http://localhost:5173` 运行，自动连接本地后端。

### 场景二：前端在 Windows，后端在远程 Linux 服务器

**远程服务器（Linux）启动后端：**

```bash
cd /path/to/LightAnno/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

确保服务器防火墙允许 8000 端口访问。

**本地 Windows 启动前端：**

复制 `.env.example` 为 `.env`（如果需要连接远程后端）：

```powershell
copy .env.example .env
```

编辑 `.env` 文件，设置后端地址：

```env
VITE_API_BASE_URL=http://your-server-ip:8000
```

例如：

```env
VITE_API_BASE_URL=http://192.168.1.100:8000
```

然后启动前端：

```powershell
cd frontend
npm install
npm run dev
```

前端将连接远程服务器的后端 API。

**注意事项：**

- 远程服务器的 `catalogs/` 和 `data/` 目录需要正确配置
- 如果后端需要访问远程服务器上的数据集，确保路径正确
- 生产环境建议使用 HTTPS 和反向代理（如 Nginx）

## Metadata 文件

- `catalogs/<catalog_id>/<catalog_id>.json` 是对应 Catalog 的主标注文件。
- `<catalog_id>.backup.json` 保存每次写入前的上一版。
- `<catalog_id>.backup.<timestamp>.json` 由“手动备份”功能生成，本质是复制当前 Catalog 主 JSON 后追加时间戳后缀。
- metadata 可通过前端导出，也可调用 `GET /api/metadata/export` 导出。

`boundaries` 固定为二维：

- `single`: `[0, 0]`
- `dual`: `[x1_norm, 0]`
- `triple`: `[x1_norm, x2_norm]`

所有非零边界坐标都相对于原图宽度归一化，并保留 4 位小数。

## 工具使用

打开前端后点击 `重新扫描`，工具会扫描当前挂载的数据集目录。界面包含：

- 顶部菜单栏：Catalog 创建、切换、导入文件夹、备份和导出。
- 左侧栏：标签树管理和标签筛选。
- 中间区域：Grid View、筛选栏、批量工具条和 Detail View。
- 右侧栏：warnings/errors 缺陷面板。

### Catalog 与导入文件夹

LightAnno 支持 Lightroom-style 的多 Catalog 工作流：

- 每个 Catalog 都有独立的主 metadata JSON、备份文件和样本列表。
- Catalog 索引保存在 `catalogs/catalogs.json`。
- 每个 Catalog 的 metadata 保存在 `catalogs/<catalog_id>/<catalog_id>.json`。
- 顶部菜单栏可以创建、打开和切换 Catalog。
- “导入文件夹到当前 Catalog”会扫描指定文件夹，并将该文件夹作为当前 Catalog 的数据根目录。

路径填写规则：

- Docker 中默认可用 `/data`，对应宿主机的 `./data`。
- Docker 中项目根目录挂载为 `/workspace`，因此可以导入 `/workspace/data_test/milktea_bill_screenshots`。
- 本地开发时可以填写绝对路径，或相对于项目根目录的路径，例如 `data_test/milktea_bill_screenshots`。

注意：当前版本每个 Catalog 维护一个主要数据根目录。再次导入新文件夹会把该文件夹作为当前 Catalog 的数据根目录并重新合并扫描结果。

### 筛选与搜索

Grid View 支持：

- 按标签、`class_status`、`layout_type`、是否缺少 text info、归档/删除状态筛选。
- 组合筛选，例如“已标注 + 双栏 + 指定标签 + 缺控件树”。
- 按 `sample_path`、`image_path`、`text_info` 做元数据搜索。
- 导出当前筛选结果。

### 标签树

在左侧栏的标签编辑器中创建或更新标签：

- `tag_path`：层级路径，例如 `ecommerce/cart`。
- `label`：显示名。
- `color`：标签颜色。

双击已有标签会将其加载到编辑器。删除标签时会级联移除所有 sample 上的该标签，行为参考 Lightroom。

### 批量操作

Grid View 中选择样本：

- 单击：选中一张 sample。
- `Cmd/Ctrl` + 单击：在当前选择中添加或移除 sample。
- `Shift` + 单击：连续范围选择。

批量工具条支持：

- 批量追加/移除标签。
- 批量设为单栏、双栏或三栏。
- 批量标记为存疑。
- 将当前 sample 的标签/状态同步到选中的多张 sample。
- 将当前 sample 的分栏类型/边界同步到选中的多张 sample。

### 详情标注

在 Grid View 中双击 sample 进入 Detail View。Canvas 区域会自适应显示原图。

- `single`：无边界线。
- `dual`：一条可拖拽垂直边界线。
- `triple`：两条可拖拽垂直边界线。

拖拽边界线时会显示实时归一化坐标 tooltip。边界线会在 `0.3333`、`0.5000`、`0.6667` 附近触发吸附，容差为 `±0.02`。三栏模式会防止左右边界交叉，并强制至少 `0.02` 间距。

边界编辑会在 300ms 防抖后通过后端持久化。

## 快捷键

- `1`, `2`, `3`：切换为单栏、双栏或三栏。
- `A` / `D` 或方向键：上一张/下一张图片。
- `Space`：保存并标记当前 sample 为已标注。
- `F`：标记当前 sample 为存疑。
- `G`：返回 Grid View。

当焦点在输入框、文本框或下拉框中时，快捷键不会触发。

## 当前工作区与 Catalog 文件

默认工作流：

- 启动后会自动创建 `Default Catalog`。
- 如果项目根目录或旧 Catalog 目录里已有旧版 `metadata.json`，首次启动会迁移/复制为新的 `<catalog_id>.json` 主文件。
- 现有标注接口默认作用于“当前激活 Catalog”。
- 备份文件会写入当前 Catalog 目录，例如 `catalogs/default/default.backup.json` 或 `catalogs/default/default.backup.<timestamp>.json`。

## 后端 API

主要接口：

- `GET /api/health`
- `GET /api/catalogs`
- `POST /api/catalogs`
- `POST /api/catalogs/open`
- `POST /api/catalogs/{catalog_id}/import-folder`
- `GET /api/workspace/init`
- `GET /api/images/{sample_id}`
- `GET /api/metadata`
- `POST /api/metadata/update`
- `POST /api/metadata/batch`
- `POST /api/workspace/move`
- `POST /api/tags/upsert`
- `POST /api/tags/update`
- `POST /api/tags/delete`
- `POST /api/tags/rename-path`
- `POST /api/metadata/backup`
- `GET /api/metadata/export`

## 常见问题

- **Docker 连接失败**：先启动 Docker Desktop，再运行 `docker compose up --build`。
- **前端没有 sample**：检查 `data/` 下是否有 sample 文件夹，且每个 sample 文件夹内有且只有一张支持格式的图片。
- **缺少 CUE data**：只会产生 warning，sample 仍然可以标注。
- **sample 内有多张图片或子文件夹**：该 sample 会被跳过，并显示在缺陷面板中。
- **Windows 路径问题**：项目使用 `pathlib.Path` 和 POSIX 风格路径，Windows 和 Linux 均可正常运行。如果在远程部署场景，确保前端 `.env` 中的 `VITE_API_BASE_URL` 指向正确的后端地址。
- **前端无法连接后端**：检查后端是否正常运行，防火墙是否开放端口，以及 `.env` 文件中的 API 地址是否正确。
