import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { customResponse } from "./responses";

@Injectable()
export class AwsService {

  private readonly s3;
  constructor() {
    this.s3 = new S3Client({
      region: process.env.ACCESS_REGION,
      credentials: {
        accessKeyId: process.env.ACCESS_KEY,
        secretAccessKey: process.env.ACCESS_SECRETE_KEY,
      },
    });
  }
  callAwsS3(file: Express.Multer.File) {
    try {
      const key = `test/${file.originalname}`;
      const bucket = process.env.BUCKET_NAME;
      console.log("BUCKET NAME ::: "+bucket);
      const upload = new Upload({
        client: this.s3,
        params: {
          Bucket: bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ContentDisposition:"inline"
        },
      });
      // const command = new DeleteObjectCommand(uploadParams);

      const res = upload.on(
        "httpUploadProgress", (progress) => {
        console.log(progress);
      }).done();
      return {
        "response": res != null
          ? new HttpException(customResponse.success, HttpStatus.OK )
          : new HttpException(customResponse.failed, 400),
        "result": `https://${bucket}.s3.amazonaws.com/${key}`,
      };
    }
    catch (e) {
      console.log(e);
    }
  }
}
