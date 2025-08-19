// Test script to fetch pre-season week 1 games
const admin = require('firebase-admin');

// Initialize Firebase Admin (using default credentials)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'easy-fantasy'
  });
}

const { manualFetchWeeklySchedule } = require('./lib/scheduleSync.js');

async function testPreseasonFetch() {
  try {
    console.log('🏈 Testing Pre-Season Week 1 fetch...');
    
    // Create a fake admin request to fetch week 1
    const fakeRequest = {
      auth: {
        uid: 'test-admin',
        token: { admin: true }
      },
      data: {
        week: 1,  // Internal week 1 (should fetch API week 2)
        season: 2024
      }
    };
    
    const result = await manualFetchWeeklySchedule(fakeRequest);
    console.log('✅ Success:', result);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testPreseasonFetch();