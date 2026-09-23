import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import RouteLoader from "./components/RouteLoader";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import FarmerLayout from "./pages/farmer/FarmerLayout";
import FarmerHomeRedirect from "./pages/farmer/FarmerHomeRedirect";
import FarmerDashboard from "./pages/FarmerDashboard";
import CreateListing from "./pages/CreateListing";
import BuyerLayout from "./pages/buyer/BuyerLayout";
import BuyerHomeRedirect from "./pages/buyer/BuyerHomeRedirect";
import ProfileContent from "./components/ProfileContent";
import SubscriptionContent from "./components/SubscriptionContent";
import PoolBoardContent from "./components/PoolBoardContent";
import PoolDetailContent from "./components/PoolDetailContent";
import CreatePoolContent from "./components/CreatePoolContent";
import DeliveryDetailsContent from "./components/DeliveryDetailsContent";
import FindDriverContent from "./components/FindDriverContent";
import PoolBoard from "./pages/PoolBoard";
import PoolDetail from "./pages/PoolDetail";
import BuyerDashboard from "./pages/BuyerDashboard";
import ListingDetail from "./pages/ListingDetail";
import ConfirmDelivery from "./pages/ConfirmDelivery";
import TransporterLayout from "./pages/transporter/TransporterLayout";
import TransporterHomeRedirect from "./pages/transporter/TransporterHomeRedirect";
import TransporterDashboard from "./pages/TransporterDashboard";
import OrderDetail from "./pages/OrderDetail";
import AddPhone from "./pages/AddPhone";
import Profile from "./pages/Profile";
import Subscription from "./pages/Subscription";
import Wallet from "./pages/Wallet";
import Prototype from "./pages/Prototype";

export default function App() {
  return (
    <BrowserRouter>
      <RouteLoader />
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pools" element={<PoolBoard />} />
        <Route path="/pools/:id" element={<PoolDetail />} />
        <Route path="/listings/:id" element={<ListingDetail />} />
        <Route path="/prototype" element={<Prototype />} />
        <Route path="/subscription" element={<Subscription />} />

        {/* Farmer — nested under a persistent layout so switching between
            dashboard/add-listing/profile/plans swaps only the inner content,
            not the whole sidebar shell. :name is a cosmetic slug of the
            farmer's own name (see FarmerLayout), not a lookup key. */}
        <Route
          path="/farmer"
          element={<ProtectedRoute allow={["FARMER"]}><FarmerHomeRedirect /></ProtectedRoute>}
        />
        <Route
          path="/farmer/:name"
          element={<ProtectedRoute allow={["FARMER"]}><FarmerLayout /></ProtectedRoute>}
        >
          <Route index element={<FarmerDashboard />} />
          <Route path="listings/new" element={<CreateListing />} />
          <Route path="profile" element={<ProfileContent />} />
          <Route path="plans" element={<SubscriptionContent />} />
          <Route path="pools" element={<PoolBoardContent />} />
          <Route path="pools/:id" element={<PoolDetailContent />} />
          <Route path="find-driver" element={<FindDriverContent />} />
        </Route>

        {/* Buyer — nested under a persistent layout, same convention as
            Farmer, so Market/Village Pools/Plans swap only the inner
            content. :name is a cosmetic slug of the buyer's own name (see
            BuyerLayout), not a lookup key. */}
        <Route
          path="/buyer"
          element={<ProtectedRoute allow={["BUYER", "ADMIN"]}><BuyerHomeRedirect /></ProtectedRoute>}
        />
        <Route
          path="/buyer/:name"
          element={<ProtectedRoute allow={["BUYER", "ADMIN"]}><BuyerLayout /></ProtectedRoute>}
        >
          <Route index element={<BuyerDashboard />} />
          <Route path="pools" element={<PoolBoardContent />} />
          <Route path="pools/new" element={<CreatePoolContent />} />
          <Route path="pools/:id" element={<PoolDetailContent />} />
          <Route path="orders" element={<DeliveryDetailsContent />} />
          <Route path="plans" element={<SubscriptionContent />} />
        </Route>
        <Route
          path="/buyer/confirm-delivery/:escrowId"
          element={<ProtectedRoute allow={["BUYER", "ADMIN"]}><ConfirmDelivery /></ProtectedRoute>}
        />

        {/* Transporter — nested under a persistent layout, same convention as
            Farmer/Buyer, so Jobs/Plans swap only the inner content. :name is
            a cosmetic slug of the transporter's own name (see
            TransporterLayout), not a lookup key. */}
        <Route
          path="/transporter"
          element={<ProtectedRoute allow={["TRANSPORTER"]}><TransporterHomeRedirect /></ProtectedRoute>}
        />
        <Route
          path="/transporter/:name"
          element={<ProtectedRoute allow={["TRANSPORTER"]}><TransporterLayout /></ProtectedRoute>}
        >
          <Route index element={<TransporterDashboard />} />
          <Route path="plans" element={<SubscriptionContent />} />
        </Route>

        {/* Shared — access to a specific trip is enforced server-side (buyer,
            farmer, driver, or admin party to that trip only). */}
        <Route
          path="/orders/:id"
          element={<ProtectedRoute><OrderDetail /></ProtectedRoute>}
        />
        <Route
          path="/account/add-phone"
          element={<ProtectedRoute><AddPhone /></ProtectedRoute>}
        />
        <Route
          path="/profile"
          element={<ProtectedRoute><Profile /></ProtectedRoute>}
        />
        <Route
          path="/wallet"
          element={<ProtectedRoute><Wallet /></ProtectedRoute>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
