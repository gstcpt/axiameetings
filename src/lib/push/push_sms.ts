import { executeExternalApiAction } from '../externalApiEngine';

export async function sendPushSMS(companyId: number, title: string, content: string, participantExternalIds: number[], participantPhones: string[], meetingId: number) {
    const promises = participantExternalIds.map((id, index) => 
        executeExternalApiAction({
            companyId,
            actionType: 'push_sms',
            payload: {
                title,
                body: content,
                identifiant_extern: id,
                phones: participantPhones[index], // Send the specific phone number
                meeting: meetingId
            }
        })
    );
    return Promise.allSettled(promises);
}
