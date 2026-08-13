import { useEffect } from "react";
import { useLocation } from "react-router";
import { useControlBridge } from "../../context/ControlBridgeContext";
import { captureWorkspacePage, identifyStaff } from "../../lib/analytics";

export default function AnalyticsBridge() {
  const location = useLocation();
  const { user, staff } = useControlBridge();

  useEffect(() => {
    if (user?.id) identifyStaff(user.id, staff?.role);
  }, [staff?.role, user?.id]);

  useEffect(() => {
    if (user?.id) captureWorkspacePage(location.pathname);
  }, [location.pathname, user?.id]);

  return null;
}
