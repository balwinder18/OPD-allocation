const express = require('express');

const db = require('../config/db');
const { PRIORITY } = require('../utils/constants');

const router = express.Router();

router.post('/token/book', async (req, res) => {

    const { patient_id, doctor_id, source } = req.body;


    if (!patient_id || !doctor_id || !source) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = await db.pool.connect();


    try {

        await client.query('BEGIN');

        //  checking for follow up req
        let currPriority = PRIORITY[source] || 4;

        if (source === 'FOLLOW_UP') {
            const patientCheck = await client.query('SELECT assigned_doctor_id FROM patients WHERE id = $1', [patient_id]);
            if (patientCheck.rows[0]?.assigned_doctor_id !== parseInt(doctor_id)) {
                currPriority = 4;
            }
        }

        // now searching for available slot
        const today = new Date().toISOString().split('T')[0];
        const slotRes = await client.query(
            `SELECT * FROM slots 
             WHERE doctor_id = $1 AND slot_date = $2 
             AND current_count < hard_limit 
             ORDER BY start_time ASC
             FOR UPDATE`,
            [doctor_id, today]
        );

        


        let slot = slotRes.rows[0];
        if (!slot) {

            const lastSlotRes = await client.query(
                'SELECT end_time FROM slots WHERE doctor_id = $1 AND slot_date = $2 ORDER BY end_time DESC LIMIT 1',
                [doctor_id, today]
            );

            let startTime = '09:00:00'; 
            if (lastSlotRes.rows.length > 0) {
                startTime = lastSlotRes.rows[0].end_time;
            }

           
            const [hours, minutes, seconds] = startTime.split(':');
            const endTime = `${(parseInt(hours) + 1).toString().padStart(2, '0')}:${minutes}:${seconds}`;

            const newSlotRes = await client.query(
                `INSERT INTO slots (doctor_id, slot_date, start_time, end_time, max_count, hard_limit, current_count)
         VALUES ($1, $2, $3, $4, 6, 8, 0) RETURNING *`,
                [doctor_id, today, startTime, endTime]
            );

            slot = newSlotRes.rows[0];
            console.log(`Automatically created new slot: ${startTime} - ${endTime}`);
        }

        const tokenNo = slot.current_count + 1;

        const lastPrioRes = await client.query(
            'SELECT MAX(sequence_number) as last_seq FROM tokens WHERE slot_id = $1 AND priority_score <= $2',
            [slot.id, currPriority]
        );

        let baseSeq = lastPrioRes.rows[0].last_seq ? parseFloat(lastPrioRes.rows[0].last_seq) : parseFloat(currPriority);
        const finalSeq = baseSeq + 0.1;


        await client.query(
            'UPDATE tokens SET sequence_number = sequence_number + 0.1 WHERE slot_id = $1 AND sequence_number >= $2',
            [slot.id, finalSeq]
        );

        const newToken = await client.query(
            `INSERT INTO tokens (slot_id, patient_id, source, priority_score, sequence_number, token_no) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [slot.id, patient_id, source, currPriority, finalSeq, tokenNo]
        );

        await client.query('UPDATE slots SET current_count = current_count + 1 WHERE id = $1', [slot.id]);

        await client.query('COMMIT');
        res.status(201).json({
            data: newToken.rows[0]
        });



    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });

    } finally {

        client.release();
    }

})




router.get('/doctor/:doctor_id', async (req, res) => {

    const { doctor_id } = req.params;

    const today = new Date().toISOString().split('T')[0];
    const client = await db.pool.connect();

    try {

        const result = await client.query(
            `SELECT 
                t.token_no, 
                t.sequence_number, 
                t.source, 
                t.status,
                p.name AS patient_name,
                t.delay_mins
             FROM tokens t
             JOIN slots s ON t.slot_id = s.id
             JOIN patients p ON t.patient_id = p.id
             WHERE s.doctor_id = $1 AND s.slot_date = $2
             ORDER BY t.sequence_number ASC`,
            [doctor_id, today]
        );


        if (result.rows.length === 0) {
            return res.status(200).json({ message: "No patients" });
        }

        res.status(200).json(result.rows);



    } catch (error) {


        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });

    } finally {
        client.release();
    }

})




router.patch('/token/:token_id/status', async (req, res) => {
    const { token_id } = req.params;
    const { status } = req.body;

    const validStatuses = ['PENDING', 'COMPLETED', 'MISSED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status provided' });
    }

    const client = await db.pool.connect();

    try {

        await client.query('BEGIN');

        const updateToken = await client.query(
            `UPDATE tokens SET status = $1 WHERE id = $2 RETURNING *`, [status, token_id]
        )

        if (updateToken.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Token not found' });
        }

        const token = updateToken.rows[0];

        if (status === 'CANCELLED') {
            await client.query(
                'UPDATE slots SET current_count = GREATEST(0, current_count - 1) WHERE id = $1',
                [token.slot_id]
            );
        }


        await client.query('COMMIT');
        res.status(200).json({ message: 'Token Updated' });





    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });

    } finally {
        client.release();
    }

})





module.exports = router;