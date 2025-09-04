import { Injectable } from "@nestjs/common";
import { HbEnums } from "../../models/dto/hubtel/hb-enums";
import { UssdResponse } from "./types";

@Injectable()
export class ResponseBuilder {
  /**
   * Create a standard USSD response
   */
  createResponse(
    sessionId: string,
    label: string,
    message: string,
    dataType: string = HbEnums.DATATYPE_INPUT,
    fieldType: string = HbEnums.FIELDTYPE_TEXT,
    type: string = HbEnums.RESPONSE
  ): string {
    const response: UssdResponse = {
      SessionId: sessionId,
      Type: type,
      Label: label,
      Message: message,
      DataType: dataType,
      FieldType: fieldType
    };

    return JSON.stringify(response);
  }

  /**
   * Create a display-only response (no user input)
   */
  createDisplayResponse(sessionId: string, label: string, message: string): string {
    return this.createResponse(
      sessionId,
      label,
      message,
      HbEnums.DATATYPE_DISPLAY,
      HbEnums.FIELDTYPE_TEXT,
      HbEnums.RESPONSE
    );
  }

  /**
   * Create an input response for numbers
   */
  createNumberInputResponse(sessionId: string, label: string, message: string): string {
    return this.createResponse(
      sessionId,
      label,
      message,
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER,
      HbEnums.RESPONSE
    );
  }

  /**
   * Create an input response for phone numbers
   */
  createPhoneInputResponse(sessionId: string, label: string, message: string): string {
    return this.createResponse(
      sessionId,
      label,
      message,
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_PHONE,
      HbEnums.RESPONSE
    );
  }

  /**
   * Create an input response for decimal numbers
   */
  createDecimalInputResponse(sessionId: string, label: string, message: string): string {
    return this.createResponse(
      sessionId,
      label,
      message,
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_DECIMAL,
      HbEnums.RESPONSE
    );
  }

  /**
   * Create a release response (end session)
   */
  createReleaseResponse(sessionId: string, label: string, message: string): string {
    return this.createResponse(
      sessionId,
      label,
      message,
      HbEnums.DATATYPE_DISPLAY,
      HbEnums.FIELDTYPE_TEXT,
      HbEnums.RELEASE
    );
  }

  /**
   * Create an error response
   */
  createErrorResponse(sessionId: string, message: string): string {
    return this.createResponse(
      sessionId,
      "Error",
      message,
      HbEnums.DATATYPE_DISPLAY,
      HbEnums.FIELDTYPE_TEXT,
      HbEnums.RELEASE
    );
  }

  /**
   * Create an invalid selection response
   */
  createInvalidSelectionResponse(sessionId: string, message: string): string {
    return this.createResponse(
      sessionId,
      "Invalid Selection",
      message,
      HbEnums.DATATYPE_INPUT,
      HbEnums.FIELDTYPE_NUMBER,
      HbEnums.RESPONSE
    );
  }

  /**
   * Create a thank you message
   */
  createThankYouResponse(sessionId: string): string {
    return this.createReleaseResponse(
      sessionId,
      "Thank you",
      "Love from Guglex Technologies"
    );
  }

  /**
   * Create a contact us response
   */
  createContactUsResponse(sessionId: string): string {
    return this.createReleaseResponse(
      sessionId,
      "Contact Us",
      "Phone: +233262195121\nEmail: guglextechnologies@gmail.com"
    );
  }

  /**
   * Create a coming soon response
   */
  createComingSoonResponse(sessionId: string, serviceName: string): string {
    return this.createReleaseResponse(
      sessionId,
      "Coming Soon",
      `${serviceName} are coming soon. Please select an available service.`
    );
  }
}
