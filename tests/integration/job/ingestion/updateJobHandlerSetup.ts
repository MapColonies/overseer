import { processJob } from '../../../../src/jobProcessor';
import { seedJob, seedTask } from '../../../../src/seeder';
import nock from 'nock';

const jobId = 'job-id';
const taskId = 'task-id';

beforeAll(async () => {
    nock('http://example.com')
        .post('/api/jobs')
        .reply(200, { id: jobId });

    nock('http://example.com')
        .post('/api/tasks')
        .reply(200, { id: taskId });

    await seedJob(jobId);
    await seedTask(taskId);
});

afterAll(() => {
    nock.cleanAll();
});