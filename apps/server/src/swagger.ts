import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { APP_VERSION } from './app.constants.js';
import { AppConfigService } from './config/app-config.service.js';

const DESCRIPTION = [
  'MCSerAuth 后端 API（M3 论坛 MVP + M4 运营能力）。',
  '',
  '**统一响应**：非协议端点成功返回 `{ code: 0, data }`，失败返回 `{ code, message }`（错误码见 packages/shared）。',
  '',
  '**例外**：`Commons-Designs` 协议端点（OAuth / Session / Profiles / Textures）返回协议原生结构，失败为 `{ error, errorMessage }`，不套统一封装。',
  '',
  '**已实现**：OAuth 授权、会话服务、档案与纹理分发；论坛版块/帖子/回复/点赞/通知/举报；',
  '账号资料（头像/签名、改名、设备令牌、纹理切换）；四级权限（审核员/管理员/超级管理员/超级后台）；',
  '管理端（禁言、封禁、内容审核、举报、版块、公告、纹理下架、服务器白名单、站点展示配置）。',
  '纹理上传经 sharp 校验后立即生效（仅原版尺寸），并通过短时签名 URL 分发。协议字段仍按暂定值与官方文档逐条核对（docs/protocol-checklist.md）。',
].join('\n');

/** Builds the OpenAPI document — the single source of truth for the API contract. */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = app.get(AppConfigService);

  const documentConfig = new DocumentBuilder()
    .setTitle('MCSerAuth API')
    .setDescription(DESCRIPTION)
    .setVersion(APP_VERSION)
    .addServer(config.authUrl, '当前认证服务地址')
    .addCookieAuth('better-auth.session_token', {
      type: 'apiKey',
      in: 'cookie',
      description: '网站会话（better-auth，M1 前端登录后由浏览器携带）',
    })
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'AccessToken' },
      'launcher-token',
    )
    .addTag('ops', '运维与健康检查')
    .addTag('Commons-Designs / OAuth', '账户与授权（协议原生响应）')
    .addTag('Commons-Designs / Session', 'MC 会话服务（协议原生响应）')
    .addTag('Commons-Designs / User', '用户档案（协议原生响应）')
    .addTag('Commons-Designs / Profiles', '玩家档案查询（协议原生响应）')
    .addTag('Commons-Designs / Textures', '皮肤/披风（协议原生响应）')
    .addTag('Forum', '论坛：版块、帖子、回复、点赞、通知、举报（统一封装）')
    .addTag('User', '账号资料：头像/签名、改名、设备令牌、纹理切换（统一封装）')
    .addTag('Admin', '管理端：用户/内容/举报/版块/公告/纹理/服务器（统一封装）')
    .build();

  return SwaggerModule.createDocument(app, documentConfig, { deepScanRoutes: true });
}

export function setupSwagger(app: INestApplication): void {
  const document = createOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
    customSiteTitle: 'MCSerAuth API',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
  });
}
