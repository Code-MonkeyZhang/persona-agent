---
title: 内置工具一览
description: 开箱即用的七个内置工具
---

应用自带七个内置工具，无需安装即可分配使用。

## 文件与命令

- **read** 读取文件内容。
- **write** 写入文件。
- **edit** 对文件做局部修改。
- **bash** 执行终端命令。
- **bash-output** 读取命令的输出。
- **bash-kill** 终止运行中的命令。

命令类工具在工作目录里执行，目录在角色配置与输入框里都可以指定，见[创建与编辑](/docs/agents/create)。

## 网络

- **webfetch** 抓取网页内容，让智能体阅读在线资料。

## 形象

另有两个面向陪伴体验的工具，智能体用它们自主切换立绘表情，见[形象定制](/docs/agents/appearance)。这类工具不需要手动分配。

## 平台差异

Windows 上命令工具依赖 Git Bash 提供 Shell 环境，应用会自动检测并在缺失时给出下载指引，排障见[环境问题](/docs/troubleshooting/environment)。
