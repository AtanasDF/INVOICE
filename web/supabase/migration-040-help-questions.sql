-- What people ask the help chat.
--
-- WHY THIS EXISTS. notes/help-chat-design.md, arguing for the chat: "what
-- people end up asking the bot is the list of what the app failed to explain.
-- Worth logging for exactly that reason." The walkthroughs cost nothing to
-- serve and always say the same correct thing; the chat costs money per
-- message and can be wrong. Every question that reaches the chat is a question
-- the walkthroughs did not anticipate, and that list is the only honest
-- measure of how good the help is.
--
-- WHAT IS NOT KEPT. The chat's answer. It is reproducible from the question,
-- it doubles the amount of somebody's text held for a purpose they did not ask
-- for, and what is being measured is the QUESTION.
--
-- THIS IS PEOPLE'S OWN WORDS, and it is kept so somebody else can read them.
-- That is different from the "Email this to Atanas" button, where a person
-- chooses to send. /privacy says so in the same commit that adds this, which
-- is the rule that page's own comment sets: "if a supplier changes, this page
-- changes in the same commit."
--
-- NO BACKUP FILE. This creates one table and alters nothing that exists, so
-- CLAUDE.md rule 2 asks for none.
--
-- Additive and idempotent: safe to run twice.

create table if not exists public.help_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Capped in the route at 600 characters, the same as the chat itself.
  question text not null,
  asked_at timestamptz not null default now()
);

-- Read by date, because the question being asked is "what are people stuck on
-- lately", not "what did this account ask".
create index if not exists help_questions_asked_idx on public.help_questions (asked_at desc);
create index if not exists help_questions_user_idx on public.help_questions (user_id, asked_at desc);

-- ---------------------------------------------------------------------------
-- Nobody reads anybody else's, through the API
-- ---------------------------------------------------------------------------
alter table public.help_questions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'help_questions' and policyname = 'help_questions_own') then
    create policy help_questions_own on public.help_questions
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Supabase grants anon and authenticated everything on a new table by default,
-- and the anon key is published in the app itself. Name `authenticated`
-- explicitly: migration-037 shipped a hole by revoking only from `public, anon`
-- and leaving a function anybody signed in could call.
revoke all on public.help_questions from public, anon, authenticated;
-- Insert only. An account has no reason to read the list back, and no reason
-- at all to edit or remove a line of it after the fact.
grant insert on public.help_questions to authenticated;

-- The list is read with the service role, the same way feedback is
-- (harness/feedback-inbox.mjs). Nothing in the app shows it.
