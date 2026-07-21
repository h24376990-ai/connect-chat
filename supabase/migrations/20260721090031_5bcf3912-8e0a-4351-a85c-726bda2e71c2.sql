ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;
ALTER FUNCTION public.create_community(text, text, text) SECURITY INVOKER;
ALTER FUNCTION public.approve_community_member(uuid, uuid, boolean) SECURITY INVOKER;
ALTER FUNCTION public.transfer_community_owner(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.remove_community_member(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.dissolve_community(uuid) SECURITY INVOKER;

CREATE POLICY "Users create owned communities" ON public.communities FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners create own membership" ON public.community_members FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND role = 'owner' AND status = 'approved' AND
  EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
);
CREATE POLICY "Community managers update memberships" ON public.community_members FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.community_members manager WHERE manager.community_id = community_members.community_id AND manager.user_id = auth.uid() AND manager.status = 'approved' AND manager.role IN ('owner', 'admin'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.community_members manager WHERE manager.community_id = community_members.community_id AND manager.user_id = auth.uid() AND manager.status = 'approved' AND manager.role IN ('owner', 'admin'))
);
CREATE POLICY "Owners remove community members" ON public.community_members FOR DELETE TO authenticated USING (
  role <> 'owner' AND EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
);