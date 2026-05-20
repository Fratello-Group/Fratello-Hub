const {
    authenticateRequest,
    getSettings,
    json,
    requireMethod
} = require('./templates/_runtime');

exports.handler = async (event) => {
    const methodError = requireMethod(event, ['GET', 'POST']);
    if (methodError) return methodError;

    try {
        const session = await authenticateRequest(event);
        const role = String(session && session.user && session.user.role_tier || '').toLowerCase();
        if (!session || role !== 'owner') {
            return json(403, { error: 'Owner access required.' });
        }

        const settings = await getSettings();
        return json(200, {
            connected: true,
            settings_id: settings.id || 'global',
            notifications_enabled: settings.notification_emails_enabled !== false
        });
    } catch (error) {
        console.error(error);
        return json(500, { connected: false, error: error.message || 'Firestore smoke test failed.' });
    }
};
