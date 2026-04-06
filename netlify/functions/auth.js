// ════════════════════════════════════════════════════════════
// Fratello Hub — Server-Side Authentication
// ════════════════════════════════════════════════════════════
//
// This Netlify Function checks access codes against environment
// variables stored in the Netlify dashboard. Passwords never
// appear in the source code or client-side JavaScript.
//
// SETUP: In Netlify → Project configuration → Environment variables,
// add these variables:
//
//   //   AUTH_OWNER, AUTH_CONTROLLER, AUTH_MARKETING,
//   AUTH_PRODUCTION, AUTH_SALES, AUTH_STAFF
//
// To change a password, just update the env var in Netlify.
// No code changes needed. No redeployment needed.
// ════════════════════════════════════════════════════════════

exports.handler = async (event) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Parse the access code from the request
    let code;
    try {
        const body = JSON.parse(event.body);
        code = (body.code || '').trim().toLowerCase();
    } catch (e) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Invalid request' })
        };
    }

    if (!code) {
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'No access code provided' })
        };
    }

    // Role definitions — passwords come from environment variables
    const roles = [
        {
            password: process.env.AUTH_OWNER,
            role: {
                key: 'owner',
                label: 'Owner',
                sections: ['finance', 'production', 'sales', 'marketing', 'operations', 'hr-open', 'hr-confidential', 'system']
            }
        },
        {
            password: process.env.AUTH_CONTROLLER,
            role: {
                key: 'controller',
                label: 'Controller',
                sections: ['finance', 'production', 'sales', 'marketing', 'operations', 'hr-open', 'hr-confidential']
            }
        },
        {
            password: process.env.AUTH_MARKETING,
            role: {
                key: 'marketing',
                label: 'Marketing',
                sections: ['marketing', 'operations', 'hr-open']
            }
        },
        {
            password: process.env.AUTH_PRODUCTION,
            role: {
                key: 'production',
                label: 'Production',
                sections: ['production', 'operations', 'hr-open']
            }
        },
        {
            password: process.env.AUTH_SALES,
            role: {
                key: 'sales',
                label: 'Sales',
                sections: ['sales', 'operations', 'hr-open']
            }
        },
        {
            password: process.env.AUTH_STAFF,
            role: {
                key: 'staff',
                label: 'Staff',
                sections: ['operations', 'hr-open']
            }
        }
    ];

    // Check the code against each role
    const match = roles.find(r => r.password && r.password.toLowerCase() === code);

    if (match) {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: match.role })
        };
    }

    // No match
    return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid access code' })
    };
};
