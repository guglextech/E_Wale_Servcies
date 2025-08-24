import {CreateEmailDto} from "../models/dto/create-email.dto";
import * as nodemailer from 'nodemailer';
import {htmlToText} from 'nodemailer-html-to-text';
import {Injectable, NotFoundException} from "@nestjs/common";
import * as fs from "fs";
import * as handlebars from 'handlebars';
import * as process from "process";


@Injectable()
export class MailService {
    constructor() {}

    async sendEmail(emailData: CreateEmailDto, template: any) {
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.TRANSPORT_EMAIL_USER,
                    pass: process.env.TRANSPORT_EMAIL_PASS,
                },
                tls: {
                    rejectUnauthorized: false,
                },
            });

            transporter.use('compile', htmlToText());

            const mailOptions = {
                from: emailData.mailFrom
                    ? emailData.mailFrom
                    : 'Vote Cast<NoReply>@gmail.com',
                to: emailData.recipient ? emailData.recipient : emailData.destination,
                subject: emailData.subject,
                html: template,
                cc: emailData.cc,
                bcc: emailData.bcc,
                attachments: emailData.attachments,
            };
            return await transporter.sendMail(mailOptions);
        } catch (error) {
            console.log(error);
            throw new NotFoundException('Email Send Failed');
        }
    }

    async readFile(emailData: CreateEmailDto, destination: string) {
        const folderName = emailData.applicationName
            ? emailData.applicationName.split(' ')
            : emailData.templateName.split('-');

        try {
            // custom functions for html templates
            handlebars.registerHelper('eq', (a, b) => a === b);
            handlebars.registerHelper('gt', (a, b) => a > b);
            handlebars.registerHelper('lt', (a, b) => a < b);
            handlebars.registerHelper('lte', (a, b) => a <= b);
            const filePath = `${destination}/${folderName[0]}/${folderName[1]}.html`;
            console.log(filePath)
            const source = fs.readFileSync(filePath, 'utf-8').toString();
            const template = await handlebars.compile(source);
            const data = emailData.data;
            const replacements = { data };
            return template(replacements);
        } catch (error) {
            console.log(error);
            throw new NotFoundException('Template Not Found');
        }
    }

    async pickEmailTemplate(emailData: CreateEmailDto) {
        const filePath = `C:\\Users\\c841848\\frontend\\Nestjs\\email-server\\templates`;
        const email = await this.readFile(emailData, filePath);
        return await this.sendEmail(emailData, email);
    }
}