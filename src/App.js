import CostScorecard from './components/CostScorecard';
import VarianceTable from './components/VarianceTable';

function App() {
  return (
    <div style={{ backgroundColor: '#0a0f1e', minHeight: '100vh' }}>
      <CostScorecard />
      <VarianceTable />
    </div>
  );
}

export default App;
