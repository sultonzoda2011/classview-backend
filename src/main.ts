import { Logger, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/all-exceptions.filter'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get(ConfigService)

  app.set('trust proxy', 1) // за nginx: реальный IP клиента для rate limit
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.setGlobalPrefix('api')
  app.enableCors({
    origin: (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: false } }))
  app.useGlobalFilters(new AllExceptionsFilter())

  if (config.get('NODE_ENV') !== 'production' || config.get('SWAGGER') === 'true') {
    const doc = new DocumentBuilder().setTitle('ClassView API').setVersion('0.1').addBearerAuth().build()
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc))
  }

  const port = Number(config.get('PORT') ?? 5990)
  await app.listen(port)
  Logger.log(`ClassView API: http://localhost:${port}/api (docs: /api/docs)`, 'Bootstrap')
}
bootstrap()
