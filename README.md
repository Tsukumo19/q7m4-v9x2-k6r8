# 酒馆骰子账簿

静态网页部署至 GitHub Pages；Supabase 保存比赛、核验管理员。原聊天继续用于剧情和掷骰。

## 本地预览

在本目录运行 `npm run preview`，打开 http://127.0.0.1:4173 。未连接数据库时只展示初始快照，不能保存或假装登录。

## 连接和上线

1. 已有 Tavern 项目已经初始化。继续现有项目时绝不要新建数据库或重跑 `db/schema.sql`；新增能力只执行对应的增量迁移。
2. 在 Supabase Authentication 创建管理员邮箱/密码账户，复制其 UUID。在 SQL Editor 执行 `insert into tavern_private.admins(user_id) values ('此处替换为账户UUID');`。关闭不需要的公开注册；即使普通人注册也没有管理员权限。
3. 单独执行本地 `db/legacy.private.sql` 导入历史秘密。文件被 Git 忽略，不要提交、放进网页或上传公开附件。
4. 在 `site/config.js` 填入项目 HTTPS URL 和 **publishable key**（或旧 anon key）。这两项设计上公开，权限依靠数据库。绝对不要填 service_role、secret key 或管理员密码。
5. 将 **tavern 目录内容作为仓库根目录**推送至确认过的 GitHub 仓库 main 分支。在仓库 Settings → Pages 选择 GitHub Actions。工作流只发布 `site/`，不发布数据库脚本、文档或本地秘密。
6. 登录网页管理员账台，录入结果；另一台手机刷新验证公开榜。密码和访问令牌仅保存在当前页面内存，不写入配置或浏览器存储；页面刷新或令牌到期需重新登录。

## 统计约定

- 余额为提供的历史快照加新比赛净收益；不会把历史局再扣一次。
- 等额下注，公布总点数较高者净赚一份赌注，低者损失同额，平局退回。允许 0 GP，步长 0.5 GP。真实点数仅供管理员审阅。
- 出场次数计已完成比赛；赌局次数计其中下注大于 0 的比赛（包括平局）。尚未投骰不计数。
- 历史最高点数、出场和赌局次数不完整时不虚构；已录新场次用 `+` 标明是下限。历史补齐后，管理员通过 SQL 校正 players 的 opening_* 字段并将 history_complete 设为 true。只补基线，不把旧比赛作为新结算录入。
- 榜单不显示选手状态或胜负战绩。最近比赛记录只含公开点数及赌注；秘密通过单独 RPC 且必须有管理员白名单。
- 提交 UUID 防止同一表单因断网重试而重复记账。录入错误暂由管理员通过 SQL 更正或删除对应比赛及 secrets；没有开放公共修改接口。
- `db/historical-archive.sql` 是已有项目的增量迁移：现存比赛默认保持结算；历史比赛计入公布点数/出场统计但不结算余额。`played_on` 是原比赛日期，`was_gamble` 可为空表示未知。历史基线只补空值，基线不包含迁移后单独归档的比赛；`opening_gp` 不可由聊天工具修改。
- Tavern MCP 提供管理员 OAuth 保护的历史比赛、统计基线和私密档案写入。聊天 OAuth 只能写，不能调用 `admin_records()` 读回私密信息；私密工具内容也会留在提交它的 ChatGPT 对话中。私密档案仍可由管理员网页读取。
- `db/register-player.sql` 是新增选手功能的增量迁移，只创建私有幂等回执表和管理员白名单保护的 `register_player` RPC；不会预先插入选手或更改既有记录。注册必须确认唯一 ID、公开名称和起始 GP。新选手的历史最高分、出场与赌局统计保持未知，后续比赛按动态 ID 绑定个人档案。聊天工具重试时沿用同一 UUID 和资料。
- `db/public-cheater-badge.sql` 只给现有选手增加默认关闭的公开“作弊者”标记，并给公开排行榜增加该布尔字段；不会预先把任何人标为作弊者。管理员经 Tavern OAuth 工具 `tavern_set_player_cheater` 明确设置或清除标记，不依据私密档案或比赛次数自动推断。网页只用公开字段显示红色称号。
- `db/public-win-loss-counts.sql` 只扩展公开排行榜的已录比赛胜负汇总，不改比赛或余额。网页隐藏赌局次数，改为显示按公布点数计算的胜 / 负场次；平局不计胜负。选手的公开对局清单从档案按钮打开浮窗。

## 权限核验（连接后必做）

使用匿名 key 调用 scoreboard 应成功；调用 record_match/admin_records 应被拒绝。用普通登录账户重复上述测试也应被拒绝。管理员应可提交和查看秘密。直接请求任何私有表均应失败。查看公开 scoreboard 响应确认无 real_a、real_b、secret 或管理员身份。再检查公开仓库和 Pages 部署产物没有 `*.private.sql`。

本地 `npm test` 验证结算、初始数据与公开文件泄密扫描；数据库 SQL 尚须在实际 Supabase 执行并完成上述权限验收。

## 官方参考

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase 数据库函数与权限](https://supabase.com/docs/guides/database/functions)
- [GitHub Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
