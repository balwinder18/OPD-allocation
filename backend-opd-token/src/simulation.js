const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

const runSimulation = async () => {
    console.log("Starting");

    try {
        // doctor 1

        console.log("\nDoctor 1");

        await axios.post(`${BASE_URL}/token/book`, { patient_id: 1, doctor_id: 1, source: 'WALK_IN' });
        await axios.post(`${BASE_URL}/token/book`, { patient_id: 2, doctor_id: 1, source: 'WALK_IN' });
        
        console.log("\nDoctor 2");
        await axios.post(`${BASE_URL}/token/book`, { patient_id: 3, doctor_id: 2, source: 'WALK_IN' });
        await axios.post(`${BASE_URL}/token/book`, { patient_id: 4, doctor_id: 2, source: 'PAID_PRIORITY' });

        // doctor 3

        console.log("\nDoctor 3");

        // Book 2 standard patients
        await axios.post(`${BASE_URL}/token/book`, { patient_id: 5, doctor_id: 3, source: 'WALK_IN' });
        await axios.post(`${BASE_URL}/token/book`, { patient_id: 6, doctor_id: 3, source: 'WALK_IN' });
        //emergency patient
        const emergency = await axios.post(`${BASE_URL}/token/book`, { patient_id: 7, doctor_id: 3, source: 'EMERGENCY' });
        console.log(`Emergency Token Issued: #${emergency.data.token_no}`);

        // queues
        console.log("\nFinal Queues According to seq of patients");
        for (let docId of [1, 2, 3]) {
            const res = await axios.get(`${BASE_URL}/doctor/${docId}`);
            console.log(`\nQueue for Doctor ${docId}:`);
            console.table(res.data.map(t => ({
                Name: t.patient_name,
                Source: t.source,
                Seq: t.sequence_number,
                Status: t.status
            })));
        }

        // cancellation
        console.log("\nCancellation Reallocation");
       
        const queueDoc1 = await axios.get(`${BASE_URL}/doctor/1`);
        const tokenIdToCancel = queueDoc1.data[0].token_no;
        await axios.patch(`${BASE_URL}/token/${tokenIdToCancel}/status`, { status: 'CANCELLED' });
        console.log(`Token ${tokenIdToCancel} cancelled. Slot capacity updated.`);

    } catch (error) {
        console.error(error);
    }
};

runSimulation();