import { createSignal, onMount } from 'solid-js';
import { WebContainerService } from '../services/container/webContainerService';
import { FileService } from '../services/container/fileService';
import { DetectionService } from '../services/container/detectionService';

/**
 * WebContainer Test Component
 * Verifies WebContainer functionality for Phase 1
 */
export function WebContainerTest() {
  const [status, setStatus] = createSignal('Not started');
  const [log, setLog] = createSignal<string[]>([]);
  const [isRunning, setIsRunning] = createSignal(false);

  const addLog = (message: string) => {
    setLog((prev) => [...prev, `[${new Date().toISOString()}] ${message}`]);
  };

  const runTests = async () => {
    setIsRunning(true);
    setStatus('Running tests...');
    setLog([]);

    try {
      // Test 1: Boot WebContainer
      addLog('Test 1: Booting WebContainer...');
      const container = await WebContainerService.getInstance();
      addLog('✓ WebContainer booted successfully');

      // Test 2: Create FileService
      addLog('Test 2: Creating FileService...');
      const fileService = new FileService(container);
      addLog('✓ FileService created');

      // Test 3: Write a file
      addLog('Test 3: Writing test file...');
      await fileService.writeFile('/test.txt', 'Hello from WebContainer!');
      addLog('✓ File written successfully');

      // Test 4: Read the file back
      addLog('Test 4: Reading test file...');
      const content = await fileService.readFile('/test.txt');
      if (content === 'Hello from WebContainer!') {
        addLog('✓ File read successfully: ' + content);
      } else {
        throw new Error(`Unexpected content: ${content}`);
      }

      // Test 5: Create a test package.json for Gen2
      addLog('Test 5: Creating Gen2 test package.json...');
      const gen2Package = {
        name: 'test-gen2',
        version: '1.0.0',
        devDependencies: {
          '@aws-amplify/backend': '^1.0.0',
        },
      };
      await fileService.writeFile(
        '/package.json',
        JSON.stringify(gen2Package, null, 2)
      );
      addLog('✓ Package.json created');

      // Test 6: Detect backend type
      addLog('Test 6: Detecting backend type...');
      const detectionService = new DetectionService(fileService);
      const backendType = await detectionService.detectBackendType('/');
      if (backendType === 'Gen2') {
        addLog('✓ Correctly detected Gen2 backend');
      } else {
        throw new Error(`Expected Gen2, got ${backendType}`);
      }

      // Test 7: Create lock files and detect package manager
      addLog('Test 7: Creating lock files...');
      await fileService.writeFile('/pnpm-lock.yaml', '# pnpm lock file');
      addLog('✓ Created pnpm-lock.yaml');

      addLog('Test 8: Detecting package manager...');
      const packageManager = await detectionService.detectPackageManager('/');
      if (packageManager === 'pnpm') {
        addLog('✓ Correctly detected pnpm package manager');
      } else {
        throw new Error(`Expected pnpm, got ${packageManager}`);
      }

      // Test 9: Directory walking
      addLog('Test 9: Testing directory walk...');
      await fileService.mkdir('/test-dir', { recursive: true });
      await fileService.writeFile('/test-dir/file1.txt', 'test');
      await fileService.writeFile('/test-dir/file2.ts', 'test');

      const files: string[] = [];
      for await (const file of fileService.walkDirectory('/')) {
        files.push(file);
      }
      addLog(`✓ Found ${files.length} files: ${files.join(', ')}`);

      // All tests passed
      setStatus('✅ All tests passed!');
      addLog('=== All Phase 1 tests completed successfully ===');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setStatus(`❌ Test failed: ${errorMessage}`);
      addLog(`❌ Error: ${errorMessage}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{ padding: '20px', 'font-family': 'monospace' }}>
      <h2>WebContainer Phase 1 Tests</h2>

      <div style={{ 'margin-bottom': '20px' }}>
        <button
          onClick={runTests}
          disabled={isRunning()}
          style={{
            padding: '10px 20px',
            'font-size': '16px',
            cursor: isRunning() ? 'not-allowed' : 'pointer',
          }}
        >
          {isRunning() ? 'Running Tests...' : 'Run Tests'}
        </button>
      </div>

      <div style={{ 'margin-bottom': '20px' }}>
        <strong>Status:</strong> {status()}
      </div>

      <div
        style={{
          'background-color': '#1e1e1e',
          color: '#d4d4d4',
          padding: '10px',
          'border-radius': '5px',
          'max-height': '500px',
          overflow: 'auto',
        }}
      >
        <pre style={{ margin: 0 }}>
          {log().length === 0
            ? 'No logs yet. Click "Run Tests" to start.'
            : log().join('\n')}
        </pre>
      </div>
    </div>
  );
}
