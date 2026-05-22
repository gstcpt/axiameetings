import { executeExternalApiAction } from '../externalApiEngine';

export async function sendPushMessage(companyId: number, title: string, content: string, participantExternalIds: number[], meetingId: number) {
    const promises = participantExternalIds.map(id => 
        executeExternalApiAction({
            companyId,
            actionType: 'push_messages',
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
