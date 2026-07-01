// fetch_examcenter.js
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'https://api.msbte.co.in/timetable_live_api/examcenterwise';
const CENTER = '1740';
const DATA_DIR = './examcenter_data';

// Create directory
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Helper: fetch JSON with promise
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        console.log(`  📡 ${url}`);
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Helper: save JSON
function saveJSON(data, filename) {
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`  💾 Saved: ${filename}`);
}

// ============================================
// Main
// ============================================

async function main() {
    console.log('='.repeat(60));
    console.log(`📡 Fetching Exam Center-wise Timetable for Center: ${CENTER}`);
    console.log('='.repeat(60));

    try {
        // Step 1: Get paper codes - returns array directly
        console.log('\n📥 Fetching paper codes...');
        const paperCodesArray = await fetchJSON(`${BASE_URL}/papercodes/${CENTER}`);
        
        if (!paperCodesArray || paperCodesArray.length === 0) {
            console.log('❌ No paper codes found');
            return;
        }
        
        const paperCodes = paperCodesArray.map(p => p.paper_code);
        console.log(`✅ Found ${paperCodes.length} paper codes`);
        saveJSON(paperCodesArray, `papercodes_${CENTER}.json`);

        // Step 2: Get exam days - also returns array directly
        console.log('\n📥 Fetching exam days...');
        const examDaysArray = await fetchJSON(`${BASE_URL}/examdays`);
        
        if (!examDaysArray || examDaysArray.length === 0) {
            console.log('❌ No exam days found');
            return;
        }
        
        const examDays = examDaysArray.map(d => d.exam_dayw);
        console.log(`✅ Found ${examDays.length} exam days: ${examDays.join(', ')}`);
        saveJSON(examDaysArray, 'examdays.json');

        // Step 3: Fetch timetable for each paper code
        console.log('\n📥 Fetching timetables for each paper code...');
        
        const allTimetables = {};
        const sessions = ['A', 'M'];
        const total = paperCodes.length;

        for (let idx = 0; idx < paperCodes.length; idx++) {
            const paperCode = paperCodes[idx];
            console.log(`\n[${idx+1}/${total}] Paper: ${paperCode}`);
            
            const paperData = {
                paper_code: paperCode,
                timetables: {}
            };

            for (const day of examDays) {
                const dayStr = String(day);
                paperData.timetables[dayStr] = {};

                for (const session of sessions) {
                    process.stdout.write(`  📡 Day ${day}${session}... `);
                    
                    try {
                        const url = `${BASE_URL}/timetable/${CENTER}/${paperCode}/${day}/${session}`;
                        const data = await fetchJSON(url);
                        
                        if (data && data.data && data.data.length > 0) {
                            paperData.timetables[dayStr][session] = data.data;
                            console.log(`✅ ${data.data.length} records`);
                        } else if (data && data.success && data.data && data.data.length > 0) {
                            paperData.timetables[dayStr][session] = data.data;
                            console.log(`✅ ${data.data.length} records`);
                        } else {
                            paperData.timetables[dayStr][session] = [];
                            console.log('⭕ No data');
                        }
                    } catch (err) {
                        console.log(`❌ Error: ${err.message}`);
                        paperData.timetables[dayStr][session] = [];
                    }
                }
            }

            // Save individual paper code data
            saveJSON(paperData, `papercode_${paperCode}.json`);
            allTimetables[paperCode] = paperData.timetables;
        }

        // Step 4: Save combined data
        console.log('\n' + '='.repeat(60));
        console.log('📊 SUMMARY');
        console.log('='.repeat(60));
        console.log(`Center Code: ${CENTER}`);
        console.log(`Total Paper Codes: ${paperCodes.length}`);
        console.log(`Total Exam Days: ${examDays.length}`);
        console.log(`Data saved to: ${DATA_DIR}/`);

        const combined = {
            center_code: CENTER,
            paper_codes: paperCodes,
            exam_days: examDays,
            timetables: allTimetables
        };
        saveJSON(combined, `combined_${CENTER}.json`);
        console.log('\n✅ Done!');

    } catch (err) {
        console.error(`\n❌ Fatal error: ${err.message}`);
    }
}

// Run it
main();