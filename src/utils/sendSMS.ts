import axios from "axios";
import * as process from "process";
 
 export function sendTicketSms(ticket) {
    // console.log(ticket, "TICKET LOGGED::");
    let message = "";
    let recipientMobile = ticket.flow === "other" ? ticket.boughtForMobile : ticket.mobile;


    console.log(ticket.flow);

    if ((ticket.flow) == "other") {
        message = `Good news! Someone has purchased a ticket for you to attend Daddy Lumba Live in Koforidua!\n` +
                  `Ticket Code: ${ticket.ticketCode}\n` +
                  `Ticket Type: ${ticket.packageType}\n` +
                  `Keep and show this code at the venue for entry. Enjoy the show!`;
    } else {
        message = `Thank you for your purchase!\n` +`You have successfully bought ${ticket.quantity} ${ticket.packageType} ticket(s) for Daddy Lumba Live in Koforidua.\n` +`Your ticket code: ${ticket.ticketCode}\n` + `Keep and show this code at the venue for entry. See you there!`;
    }

    console.log(message);

    try {
        const response =  axios.get(process.env.SMS_URL, {
            params: {
                clientsecret: process.env.SMS_CLIENT_SECRET,
                clientid: process.env.SMS_CLIENT_ID,
                from: process.env.SMS_SENDER,
                to: recipientMobile,
                content: message,
            },
        });

        console.log("SMS sent successfully:", response);
    } catch (error) {
        console.error("Error sending SMS:", error);
    }
}

// module.exports = { sendTicketSms };