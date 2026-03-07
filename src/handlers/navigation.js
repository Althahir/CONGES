const path = require('path');

module.exports = function registerNavigationHandlers(ctx, safeHandle) {

    safeHandle('navigateTo', async (event, page) => {
        const pagePath = path.join(__dirname, '..', 'pages', page);
        ctx.mainWindow.loadFile(pagePath);
        return { success: true };
    });

};
