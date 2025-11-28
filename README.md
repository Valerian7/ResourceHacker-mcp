# ResourceHacker MCP 服务器

基于 Model Context Protocol (MCP) 的 ResourceHacker 工具服务器，可通过 Claude、codex等使用自然语言操作 Windows PE 文件资源。

## 功能特性

通过 MCP 协议提供 ResourceHacker 的命令行功能访问：

- **提取资源** - 从 PE 文件（exe、dll 等）中提取图标、位图、对话框、菜单等资源
- **列出资源** - 查看 PE 文件中包含的所有资源列表，无需提取文件
- **添加资源** - 向可执行文件添加新资源
- **删除资源** - 从 PE 文件中删除资源
- **修改资源** - 更新现有资源
- **编译资源脚本** - 将 .rc 资源脚本编译为 .res 二进制文件
- **更改语言** - 修改所有资源的语言 ID
- **执行脚本** - 运行包含多个命令的 ResourceHacker 脚本
- **获取帮助** - 显示 ResourceHacker 命令行帮助信息

## 安装配置

### 前置要求

- Windows 操作系统
- Node.js 18 或更高版本
- Claude code、codx等支撑mcp的应用
- ResourceHacker.exe

### 步骤 1：安装依赖

```bash
cd mcp_server
npm install
```

### 步骤 2：配置 Claude Desktop

编辑配置文件：`%APPDATA%\Claude\claude_desktop_config.json`

添加以下配置：

```json
{
  "mcpServers": {
    "resource-hacker": {
      "command": "node",
      "args": [
        "path\\mcp_server\\index.js"
      ],
      "env": {
        "RESOURCE_HACKER_PATH": "path\\ResourceHacker.exe"
      }
    }
  }
}
```

- 将路径替换为你的实际安装位置
- `RESOURCE_HACKER_PATH` 指向 ResourceHacker.exe 的完整路径

### 步骤 3：重启 Claude Desktop

完全关闭并重新打开 Claude Desktop 以加载 MCP 服务器。

## 可用工具

### 1. list_resources - 列出资源

查看 PE 文件中包含的所有资源列表，无需提取文件。此命令可以避免产生大量临时文件。

**参数：**
- `input_file` (必需)：输入 PE 文件的路径

**使用示例：**
```
列出 myapp.exe 中的所有资源
```

### 2. extract_resource - 提取资源

从 PE 文件或资源文件中提取资源。

**参数：**
- `input_file` (必需)：输入 PE 文件的路径
- `output_path` (必需)：输出文件或文件夹路径
- `resource_mask`：资源掩码格式 `类型,名称,语言`（默认：`,,`）
- `log_file`：日志文件路径或 `CONSOLE`（默认：`CONSOLE`）

**使用示例：**
```
从 notepad.exe 中提取所有图标到 icons 文件夹
```

### 3. add_resource - 添加资源

向 PE 文件添加新资源。

**参数：**
- `input_file` (必需)：要修改的 PE 文件路径
- `output_file` (必需)：输出文件路径
- `resource_file` (必需)：要添加的资源文件路径
- `resource_mask`：资源掩码（默认：`,,`）
- `mode`：添加模式 - `add`（存在则失败）、`addoverwrite`（覆盖）、`addskip`（跳过）
- `log_file`：日志文件路径

**使用示例：**
```
用 newicon.ico 替换 myapp.exe 的主图标
```

### 4. delete_resource - 删除资源

从 PE 文件中删除资源。

**参数：**
- `input_file` (必需)：PE 文件路径
- `output_file` (必需)：输出文件路径
- `resource_mask` (必需)：标识要删除资源的掩码
- `log_file`：日志文件路径

### 5. modify_resource - 修改资源

修改 PE 文件中的现有资源。

**参数：**
- `input_file` (必需)：PE 文件路径
- `output_file` (必需)：输出文件路径
- `resource_file` (必需)：新资源文件路径
- `resource_mask`：资源掩码
- `log_file`：日志文件路径

### 6. compile_rc - 编译资源脚本

将资源脚本（.rc）编译为二进制格式（.res）。

**参数：**
- `input_rc` (必需)：.rc 文件路径
- `output_res` (必需)：输出 .res 文件路径
- `log_file`：日志文件路径

**使用示例：**
```
编译 resources.rc 为 resources.res
```

### 7. change_language - 更改语言

更改 PE 文件中所有资源的语言。

**参数：**
- `input_file` (必需)：PE 文件路径
- `output_file` (必需)：输出文件路径
- `language_id` (必需)：语言 ID 数字
- `log_file`：日志文件路径

**常用语言 ID：**
- 1033：英语（美国）
- 2052：中文（简体）
- 1028：中文（繁体）
- 1049：俄语
- 1031：德语
- 1036：法语
- 1041：日语
- 1042：韩语

**使用示例：**
```
将 myapp.exe 的所有资源改为简体中文
```

### 8. run_script - 运行脚本

执行包含多个命令的 ResourceHacker 脚本文件。

**参数：**
- `script_file` (必需)：脚本文件路径

### 9. get_help - 获取帮助

获取 ResourceHacker 命令行帮助。

**参数：**
- `topic`：帮助主题 - `general`、`commandline` 或 `script`

## 资源掩码格式

资源掩码格式：`类型,名称,语言`

- **类型**：资源类型（如 `ICON`、`BITMAP`、`DIALOG`、`MENU`、`STRINGTABLE`、`ICONGROUP`）
- **名称**：资源名称或 ID
- **语言**：语言 ID（0 表示语言中性）

**示例：**
- `ICON,,` - 所有图标，任意名称，任意语言
- `BITMAP,128,0` - ID 为 128 的位图，语言中性
- `ICONGROUP,MAINICON,` - 名为 MAINICON 的图标组，任意语言
- `,,1033` - 所有英语（美国）资源

## 使用示例

### 提取图标
```
从 C:\Windows\System32\notepad.exe 提取所有图标到 notepad_icons 文件夹
```

### 替换应用图标
```
使用 newicon.ico 替换 myapp.exe 的主图标，保存为 myapp_new.exe
```

### 编译资源
```
编译 resources.rc 为 resources.res
```

### 更改语言
```
将 app.exe 中的所有资源更改为简体中文（语言 ID 2052）
```

## 技术细节

- **语言：** JavaScript (ES Modules)
- **运行时：** Node.js 18+
- **协议：** Model Context Protocol (MCP)
- **SDK：** @modelcontextprotocol/sdk v1.0.4
- **平台：** 仅限 Windows（需要 ResourceHacker.exe）

## 常见问题

### MCP 服务器未在 Claude 中显示

1. 检查配置文件路径是否正确并使用双反斜杠
2. 验证 Node.js 已安装：运行 `node --version`
3. 确保 `npm install` 已成功完成
4. 完全重启 Claude Desktop（不仅是关闭窗口）
5. 检查 Claude Desktop 日志是否有错误

### 路径问题

确保配置文件中的路径是绝对路径并使用双反斜杠：
- ✅ 正确：`"D:\\Tools\\resource_hacker\\mcp_server\\index.js"`
- ❌ 错误：`"D:\Tools\resource_hacker\mcp_server\index.js"`
- ❌ 错误：`"./index.js"` 或 `"index.js"`

### 找不到 ResourceHacker.exe

确保在配置中正确设置了 `RESOURCE_HACKER_PATH` 环境变量，指向 ResourceHacker.exe 的完整路径。

### 权限错误

修改系统文件时需要适当的权限，尤其是在修改系统目录中的文件时。

## 限制说明

- 需要 Windows 操作系统
- ResourceHacker.exe 必须可访问
- 无法修改"打包"或"压缩"的可执行文件
- 某些操作需要对目标文件的写权限

## 环境变量配置

服务器通过环境变量 `RESOURCE_HACKER_PATH` 查找 ResourceHacker.exe。

**在 Claude Desktop 配置中设置：**
```json
"env": {
  "RESOURCE_HACKER_PATH": "D:\\path\\to\\ResourceHacker.exe"
}
```

**或在系统中设置环境变量（可选）：**
- Windows：在系统环境变量中添加 `RESOURCE_HACKER_PATH`

如果未设置环境变量，将使用默认值 `ResourceHacker.exe`（需要在 PATH 中）。

## 许可证

- **ResourceHacker：** Freeware by Angus Johnson
- **MCP 服务器包装代码：** MIT License

## 参考链接

- [ResourceHacker 官方网站](http://www.angusj.com/resourcehacker/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Windows 资源类型文档](https://learn.microsoft.com/zh-cn/windows/win32/menurc/resource-types)

## 更新日志

### v1.1.0
- 新增 `list_resources` 工具，无需提取即可查看资源列表，减少文件混乱
- 优化代码结构，增加临时文件清理机制
- 修复 `parseRcFile` 解析逻辑

### v1.0.0
- 初始版本
- 实现 8 个 MCP 工具
- 支持可配置的 ResourceHacker.exe 路径
- 完整的错误处理和日志记录
