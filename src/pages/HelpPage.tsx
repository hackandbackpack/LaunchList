import { Mail, Phone, MapPin } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CONFIG } from '@/lib/config';

export default function HelpPage() {
  return (
    <PageLayout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              Help & <span className="text-gradient">FAQ</span>
            </h1>
            <p className="text-muted-foreground">
              Everything you need to know about submitting decklists.
            </p>
          </div>

          {/* How to Format */}
          <Card className="glow-card mb-8 animate-slide-up">
            <CardHeader>
              <CardTitle>How to Format Your Decklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                We support most common decklist formats. The simplest format is:
              </p>
              <pre className="bg-secondary/50 rounded-lg p-4 font-mono text-sm overflow-x-auto">
{`4 Lightning Bolt
4 Monastery Swiftspear
2 Goblin Guide
1 Mountain`}
              </pre>
              <p className="text-muted-foreground">
                You can also use:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li><code className="text-primary">4x Lightning Bolt</code> - with "x" separator</li>
                <li><code className="text-primary">4 Lightning Bolt (2XM)</code> - with set code</li>
                <li><code className="text-primary">SB: 2 Smash to Smithereens</code> - sideboard prefix</li>
              </ul>
              <p className="text-muted-foreground">
                Lines starting with <code className="text-primary">//</code> or <code className="text-primary">#</code> are treated as comments and ignored.
              </p>
            </CardContent>
          </Card>

          {/* FAQ */}
          <Card className="glow-card animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <CardHeader>
              <CardTitle>Frequently Asked Questions</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="item-1">
                  <AccordionTrigger>How long does it take to pull my cards?</AccordionTrigger>
                  <AccordionContent>
                    Typically 1-3 business days, depending on the size of your list and our current order volume. 
                    We'll notify you as soon as your order is ready for pickup.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-2">
                  <AccordionTrigger>What if you don't have all my cards?</AccordionTrigger>
                  <AccordionContent>
                    If we can't find certain cards, we'll note them in your order. You can see missing items 
                    when you check your order status. We'll still pull everything we have in stock.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-3">
                  <AccordionTrigger>Can I specify card conditions or editions?</AccordionTrigger>
                  <AccordionContent>
                    Yes! Use the "Notes" field when submitting your decklist. You can specify things like 
                    "prefer NM only", "any printing under $2", "foil ok", etc.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-4">
                  <AccordionTrigger>What games do you support?</AccordionTrigger>
                  <AccordionContent>
                    We currently support Magic: The Gathering, One Piece TCG, Pokémon, and other games. 
                    Select "Other" if your game isn't listed and specify in the notes.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-5">
                  <AccordionTrigger>Do I need an account?</AccordionTrigger>
                  <AccordionContent>
                    No! Customers can submit decklists without creating an account. Just provide your 
                    email and we'll send notifications about your order status.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-6">
                  <AccordionTrigger>How do I pay?</AccordionTrigger>
                  <AccordionContent>
                    Payment is collected when you pick up your order in-store. We accept cash, credit/debit cards, 
                    and store credit.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-7">
                  <AccordionTrigger>Can I cancel my order?</AccordionTrigger>
                  <AccordionContent>
                    Yes, contact us in-store or by email to cancel your order. If staff has already started 
                    pulling cards, we may not be able to cancel.
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-8">
                  <AccordionTrigger>How long will you hold my order?</AccordionTrigger>
                  <AccordionContent>
                    We'll hold your pulled cards for 7 days after marking them "Ready". After that, 
                    the cards go back into inventory. We'll send a reminder before the hold expires.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card className="glow-card mt-8 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <CardHeader>
              <CardTitle>Still Have Questions?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Visit us at <strong>{CONFIG.store.name}</strong> or reach out:
              </p>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-center gap-2"><Mail className="h-4 w-4" /> {CONFIG.store.email}</li>
                <li className="flex items-center gap-2"><Phone className="h-4 w-4" /> {CONFIG.store.phone}</li>
                <li className="flex items-center gap-2"><MapPin className="h-4 w-4" /> {CONFIG.store.address}</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
