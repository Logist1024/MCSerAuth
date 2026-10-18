import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { APP_VERSION } from './app.constants.js';
import { AppConfigService } from './config/app-config.service.js';

const DESCRIPTION = [
  'MCSerAuth 后端 API（M0 底座）。',
  '',
  '**统一响应**：非协议端点成功返回 `{ code: 0, data }`，失败返回 `{ code, message }`（错误码见 packages/shared）。',
  '',
  '**例外**：`Commons-Designs` 协议端点（OAuth / Session / Profiles / Textures）返回协议原生结构，失败为 `{ error, errorMessage }`，不套统一封装。',
  '',
  '**M0 状态**：协议端点均为 stub；标有 “M1/M2 目标响应” 的结构是待实现契约，正与官方协议文档逐条核对（docs/protocol-checklist.md）。',
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
