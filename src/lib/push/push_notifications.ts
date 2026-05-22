import { executeExternalApiAction } from '../externalApiEngine';

export async function sendPushNotification(companyId: number, title: string, content: string, participantExternalIds: number[], meetingId: number) {
    const promises = participantExternalIds.map(id => 
        executeExternalApiAction({
            companyId,
            actionType: 'push_notification',
            payload: {
                title,
                body: content,
                identifiant_extern: id,
                meeting: meetingId
            }
        })
    );
    return Promise.allSettled(promises);
}
