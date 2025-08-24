import { ApiProperty } from '@nestjs/swagger';

export class Attachments {
  @ApiProperty({
    required: true,
    description: ' filename to be reported as the name of the attached file.',
  })
  filename?: string;

  @ApiProperty({
    description: 'Use this if the attatchement is file.',
    required: false,
  })
  content: string;

  @ApiProperty({
    required: false,
    description:
      'optional content type for the attachment, if not set will be derived from the filename property',
  })
  contentType?: string;

  @ApiProperty({
    required: false,
    description:
      'path to the file if you want to stream the file instead of including it (better for larger attachments)',
  })
  path?: string;

  @ApiProperty({
    required: false,
    description: 'an URL to the file (data uris are allowed as well)',
  })
  href?: string;

  constructor(
    filename: string,
    content?: string,
    contentType?: string,
    path?: string,
  ) {
    this.filename = filename;
    this.content = content;
    this.contentType = contentType;
    this.path = path;
  }
}

export class CreateEmailDto implements CreateEmail {
  @ApiProperty({
    required: false,
    description:
      'This is the name of the email template to be triggerd. It has a simple convension: {folder name}-{name of html template file}. An example is EDD-compliance',
  })
  templateName?: string;

  @ApiProperty({
    required: false,
    description:
      "This is the same as recipient. It takes the email address of the person who will be receiving the email. If this is used, there's no need to use 'recipient'",
  })
  destination?: string;

  @ApiProperty({
    required: true,
    description: 'This is the subject of the email to be sent.',
  })
  subject: string;

  @ApiProperty({
    required: false,
    default: 'lns <noreply@gmail.com.gh>',
    description:
      "This is the field to pass the 'from' email address. It's defaulted to SBG's noreply",
  })
  mailFrom?: string = 'lns <noreply@gmail.com.gh>';

  @ApiProperty({
    type: [String],
    required: false,
    description: 'This works the same way as cc in sending emails.',
  })
  cc: Array<string> | string;

  @ApiProperty({
    type: Object,
    description:
      'Data holds an object/dictionary of information to be placed in the email template. The designer of the template is responsible for providing the variable names to the backend developer.',
  })
  data: any;

  @ApiProperty({
    required: false,
    description:
      "This is the same as destination. It takes the email address of the person who will be receiving the email. If this is used, there's no need to use 'destination'",
    deprecated: true,
  })
  recipient?: string;

  @ApiProperty({
    required: false,
    description:
      "This is the name of the email template to be triggerd. It has a simple convension: {folder name}-{name of html template file}. It's available due to some old email templates",
    deprecated: true,
  })
  applicationName?: string;

  @ApiProperty({ required: false, deprecated: true })
  message?: string;

  @ApiProperty({ required: false })
  date?: Date;

  @ApiProperty({ required: false })
  bcc?: string;

  @ApiProperty({
    required: false,
    type: [Attachments],
    description: 'This takes an array/list of objects/dictionaries.',
  })
  attachments?: Array<any>;
}

export interface CreateEmail {
  templateName?: string;
  subject: string;
  mailFrom?: string;
  cc: Array<string> | string;
  data: any;

  destination?: string;
  recipient?: string;
  applicationName?: string;
  message?: string;
  date?: Date;
  bcc?: string;
  attachments?: Array<any>;
}
