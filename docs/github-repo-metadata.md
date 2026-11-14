# GitHub About 文案与 topics 候选

> 仓库 Settings → General → Description / Topics 候选文本（本次整备不联网提交，
> 由作者粘贴启用）。topics 规则：小写字母 / 数字 / 连字符，单个 ≤ 50 字符。

## About（Description，英文）

```
All-in-one community forum + external authentication (Commons-Designs protocol, authlib-injector/Yggdrasil) for third-party Minecraft: Java Edition servers. One account covers launcher login, skins and the forum. Single-unit deploy: Node.js 22 · NestJS · Next.js · SQLite/MySQL/PostgreSQL.
```

（约 300 字符，符合 GitHub 350 字符上限；不夸大——未提 demo 站与 Docker。）

## Topics 候选（15 个）

```
minecraft
minecraft-server
authlib-injector
yggdrasil
external-login
skin
cape
forum
self-hosted
oauth2
sso
hmcl
pcl2
nestjs
nextjs
```

取舍说明：

- 核心检索词在前：`minecraft` / `minecraft-server` / `authlib-injector` / `yggdrasil`
  是目标服主会搜的词；`external-login`（外置登录的英文习惯说法）与
  `self-hosted`（GitHub 官方话题）覆盖「自建认证」意图；
- `oauth2` + `sso` 覆盖姊妹服务接入方；`skin` / `cape` / `forum` 描述社区侧；
- `hmcl` / `pcl2` 覆盖国内两大启动器的用户搜索习惯；
- `nestjs` / `nextjs` 面向想看代码实现/借鉴的开发者；
- 未放 `blessing-skin` 等其他项目名（避免蹭话题）；未放 `paper` / `spigot`
  （本仓库不含服务端插件，放这些词会误导）。

## Website 字段建议

没有长期在线的演示站，Website 留空或填 GitHub Pages 内的文档站；
**不要**填一个未部署的域名。
