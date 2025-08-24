import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as cors from "cors";
import { ValidationPipe } from "@nestjs/common";
import {
  DocumentBuilder,
  SwaggerDocumentOptions,
  SwaggerModule,
} from "@nestjs/swagger";
import redoc from "redoc-express";
import * as process from "process";
import * as dotenv from "dotenv";

dotenv.config();
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const PORT = process.env.PORT || 3000;

  const config = new DocumentBuilder()
    .setTitle("Etickets APIs")
    .setDescription("API description")
    .setVersion("1.0")
    .build();

  const options: SwaggerDocumentOptions = {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    ignoreGlobalPrefix: true,
    deepScanRoutes: true,
  };

  const document = SwaggerModule.createDocument(app, config, options);
  SwaggerModule.setup("api", app, document);

  const redocOptions = {
    title: "Eticket APIs",
    routePrefix: "/docs",
    specUrl: "/api-json",
  };

  app.use("/docs", redoc(redocOptions));

  // Allow requests from your Angular app's domain
  app.use(
    cors({
      origin: [
        "http://localhost:8080",
        "http://localhost:4200",
        "http://localhost:3000",
      ],
    })
  );
  app.useGlobalPipes(new ValidationPipe());
  app.listen(PORT, () => {
    console.log("App is running on port " + PORT);
  });
}
bootstrap();
