import {CreateEmailDto} from "../models/dto/create-email.dto";
import * as nodemailer from 'nodemailer';
import {htmlToText} from 'nodemailer-html-to-text';
import {Injectable, NotFoundException} from "@nestjs/common";
import * as fs from "fs";
import * as handlebars from 'handlebars';
import * as process from "process";


@Injectable()
export class SMService {
    constructor() {}

    
}