import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Fact, FactGrid } from "@/components/fact";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { RowCard, RowCardList } from "@/components/row-card";
import { Section } from "@/components/section";
import { StatusChip } from "@/components/status-chip";
import { formatAttemptTime } from "@/app/operate/events/[id]/delivery/presentation";
import { DELIVERY_LABELS } from "@/app/participation/presentation";
import { UnavailableScreen } from "@/app/operate/unavailable";
import { SEND_MESSAGES } from "@/lib/auth/roster-access";
import { isServiceError } from "@/lib/db";
import { formatMegabytes } from "@/lib/services/club-message-input";
import { readClubMessage, type ClubMessageDetail } from "@/lib/services/club-messages";
import { gateShellPage } from "../../gate";
import { RecipientsSection } from "../recipients-section";
import { audienceLabel } from "../message-list";
import {
  ATTACHMENTS_HEADING,
  AUDIENCE_GROUPS_LABEL,
  BACK_TO_MESSAGES,
  BODY_LABEL,
  MESSAGES_PATH,
  NOT_REACHABLE_HEADING,
  PAGE_HEADING,
  PROGRESS_CHIP_STATUS,
  PROGRESS_LABELS,
  RECIPIENTS_HEADING,
  SENDS_LABEL,
  SENT_BY_LABEL,
  SENT_LABEL,
  peopleCount,
  sentNotice,
} from "../presentation";

/** One message: what was sent, to whom, and where each copy is. LAN-514; May send Messages (LAN-520). */
export default async function MessagePage({
  params,
  searchParams,
}: PageProps<"/operate/messages/[id]">) {
  const { id } = await params;
  const gate = await gateShellPage(`${MESSAGES_PATH}/${id}`, SEND_MESSAGES);
  if ("screen" in gate) return gate.screen;
  const query = await searchParams;

  let message: ClubMessageDetail;
  try {
    message = await readClubMessage(id, gate.operator.grants);
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen
        title={PAGE_HEADING}
        message={error.message}
        testId="club-message-unavailable"
      >
        <Box>
          <Button variant="outlined" href={MESSAGES_PATH}>
            {BACK_TO_MESSAGES}
          </Button>
        </Box>
      </UnavailableScreen>
    );
  }

  const when = formatAttemptTime(new Date(message.scheduledFor));
  return (
    <Stack spacing={3} data-testid="club-message-screen">
      <PageHeader
        eyebrow={PAGE_HEADING}
        title={message.subject}
        back={{ href: MESSAGES_PATH, label: BACK_TO_MESSAGES }}
        status={
          <StatusChip
            domain="delivery"
            status={PROGRESS_CHIP_STATUS[message.progress]}
            label={PROGRESS_LABELS[message.progress]}
            testId="club-message-progress"
          />
        }
      />

      {query.sent === "1" ? (
        <Notice severity="success" testId="club-message-sent">
          {sentNotice(message.recipientCount, message.progress === "scheduled")}
        </Notice>
      ) : null}

      <FactGrid columns={4}>
        <Fact label={message.progress === "scheduled" ? SENDS_LABEL : SENT_LABEL} value={when} />
        <Fact label={SENT_BY_LABEL} value={message.sentBy} />
        <Fact label={AUDIENCE_GROUPS_LABEL} value={audienceLabel(message.audienceGroups)} />
        <Fact
          label={RECIPIENTS_HEADING}
          value={peopleCount(message.recipientCount)}
          note={
            message.unreachableCount > 0
              ? `${NOT_REACHABLE_HEADING}: ${message.unreachableCount}`
              : undefined
          }
        />
      </FactGrid>

      {/* LAN-514, Brian's walk on 31 October: the message and its files in one box. */}
      <Section title={BODY_LABEL} testId="club-message-body">
        <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
          {message.body}
        </Typography>
        {message.attachments.length > 0 ? (
          <Box data-testid="club-message-attachments">
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" component="h3" sx={{ mb: 0.5 }}>
              {ATTACHMENTS_HEADING}
            </Typography>
            <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
              {message.attachments.map((file) => (
                <Typography component="li" variant="body2" key={file.id}>
                  {`${file.filename} · ${formatMegabytes(file.byteSize)}`}
                </Typography>
              ))}
            </Stack>
          </Box>
        ) : null}
      </Section>

      {/* Named only for a seat that reads Contact & emergency: the list says who had an email. */}
      {/* LAN-514: closed on arrival; the header keeps the count and the not-reachable count. */}
      {message.recipientsNamed ? (
        <RecipientsSection
          title={`${RECIPIENTS_HEADING} · ${message.recipients.length}`}
          description={
            message.unreachableCount > 0
              ? `${NOT_REACHABLE_HEADING}: ${message.unreachableCount}`
              : undefined
          }
          testId="club-message-recipients"
        >
          <RowCardList at="all" dense testId="club-message-recipient-list">
            {message.recipients.map((recipient) => (
              <RowCard
                key={recipient.personId}
                dense
                title={recipient.displayName}
                chips={
                  <StatusChip
                    domain="delivery"
                    status={recipient.state}
                    label={DELIVERY_LABELS[recipient.state] ?? recipient.state}
                  />
                }
                sublines={recipient.lastError ? [recipient.lastError] : []}
              />
            ))}
          </RowCardList>
        </RecipientsSection>
      ) : null}
    </Stack>
  );
}
